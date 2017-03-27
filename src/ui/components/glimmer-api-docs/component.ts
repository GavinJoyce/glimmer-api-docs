import Component, { tracked } from "@glimmer/component";

const DATA = window.docs;

function materialize(obj) {
  if (Object.keys(obj).length !== 2 || !obj.id || !obj.type) {
    return obj;
  }
  const found = DATA.included.find((item) => item.id === obj.id && item.type === obj.type);
  return found;
}

function inflateRelationship({ relationships }, key, recurse = false) {
  const v = relationships[key].data.map(materialize);
  return v;
}

function toViewObject(obj) {
  return _toViewObject(obj, false);
}

function toInflatedViewObject(obj) {
  return _toViewObject(obj, true);
}

function flagsMap(thing) {
  let { flags } = thing;
  if (flags) {
    if (!flags.isPrivate && !flags.isProtected) {
      flags.isPublic = true;
    }
  }
  return thing;
}

function signatureMap(signature) {
  signature.hasBody = signature.comment || signature.parameters;
  return signature;
}

function categoryFor(method: any) {
  for (let signature of method.signatures) {
    let comment = signature.comment;
    let tags = comment && comment.tags;

    if (!tags) { continue; }

    for (let tag of tags) {
      if (tag.tagName === 'category') {
        return tag.text.trim();
      }
    }
  }

  return null;
}

function addViewMeta(attributes) {
  if (attributes.properties) {
    flagsMap(attributes.properties);
  }
  if (attributes.methods) {
    let hasMethodCategories = false;

    attributes.methods = attributes.methods.map((method) => {
      flagsMap(method);
      if (method.callSignatures) {
        method.signatures = method.callSignatures.map(signatureMap);
      }
      if (method.signatures) {
        let category = categoryFor(method);
        if (category) {
          hasMethodCategories = true;
          method.category = category;
        }
      }
      return method;
    });
    attributes.hasMethodCategories = hasMethodCategories;
  }
  if (attributes.functions) {
    attributes.functions = attributes.functions.map((method) => {
      flagsMap(method);
      if (method.callSignatures) {
        method.signatures = method.callSignatures.map(signatureMap);
      }
      return method;
    });
  }
  if (attributes.constructors) {
    attributes.constructors = attributes.constructors.map((method) => {
      if (method.constructorSignatures) {
        method.signatures = method.constructorSignatures.map(signatureMap);
      }
      return method;
    });
  }
  return attributes;
}

function _toViewObject({ type, id, attributes, relationships }, recurse = false) {
  const identifier = {
    type,
    id
  };
  let viewObject = identifier;
  if (!attributes) {
    attributes = materialize(identifier).attributes;
  }
  attributes = addViewMeta(attributes);

  for (let key in attributes) {
    viewObject[key] = attributes[key];
  }

  for (let key in relationships) {
    let relationship = relationships[key];
    viewObject[key] = recurse ? relationship.data.map(toInflatedViewObject) : relationship.data;
  }

  return viewObject;
}

function inflate({id, type, attributes, relationships }, recurse = false) {
  let inflated = {};
  for (let key in relationships) {
    inflated[key] = {
      data: inflateRelationship(relationships, key)
    };
  }
  return {
    id,
    type,
    attributes,
    relationships: inflated
  };
}

function toMenuProject(menu) {
  let children = [];
  for (let key in menu) {
    if (Array.isArray(menu[key])) {
      const set = menu[key]
        .filter((obj) => {
          return obj.flags && obj.flags.isNormalized;
        })
        .map(toInflatedViewObject)
      children = children.concat(set);
    }
  }
  menu.children = children.sort((a, b) => a.name > b.name ? 1 : -1);
  return menu;
}

function generateMenu(root) {
  return inflateRelationship(root.data, 'docmodules').map(toInflatedViewObject).map(toMenuProject);
}

class DocsService {
  main = DATA;

  fetchRoot() {
    return {
      main: this.main.data.attributes,
      menu: generateMenu(this.main)
    };
  }

  fetchModule(moduleId, projectId) {
    let record = this.main.included.find(({ id }) => id === moduleId);

    if (!record) {
      const realId = this.main.data.attributes.idMap[projectId][moduleId];
      record = this.main.included.find(({ id }) => id === realId);
    }

    if (!record) {
      return null;
    }

    const inflated = toInflatedViewObject(record);
    return inflated;
  }

  fetchProject(projectId) {
    return toInflatedViewObject(this.main.included.find(({ type, id }) => type === 'projectdoc' && id === projectId));
  }
};

interface CurrentView {
  componentName: string | null;
  project;
  module;
}

export default class GlimmerApiDocs extends Component {
  @tracked theCurrentView: CurrentView = {
    componentName: null,
    project: null,
    module: null
  };

  /**
   * Service object to fetch docs data.
   */
  docsService = new DocsService();

  /**
   * This property holds the whole documentation tree.
   */
  get model() {
      return this.docsService.fetchRoot();
  }

  showProject(projectId) {
    this.theCurrentView = {
      componentName: 'project-landing',
      project: this.docsService.fetchProject(projectId),
      module: null
    };
  }

  showModule(projectId, moduleId) {
    this.theCurrentView = {
      componentName: 'module-landing',
      project: this.docsService.fetchProject(projectId),
      module: this.docsService.fetchModule(moduleId, projectId);
    };
  }
}
