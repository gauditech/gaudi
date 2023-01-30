import _ from "lodash";

export class Vars {
  _vars: Record<string, any>;
  constructor(params = {}) {
    this._vars = params;
  }
  set(name: string, value: any) {
    Object.assign(this._vars, { [name]: value });
  }
  get(name: string, path?: string[]): any {
    return _.get(this._vars, [name, ...(path ?? [])]);
  }
  all(): any {
    return this._vars;
  }
  collect(path: string[]): any {
    return collect(this._vars, path);
  }
  copy() {
    return new Vars(_.cloneDeep(this._vars));
  }
}

function collect(vars: Record<string, any>, path: string[]): any {
  if (_.isEmpty(path)) {
    return vars;
  }
  const [name, ...rest] = path;
  if (_.isArray(vars)) {
    return _.compact(vars.flatMap((v) => collect(_.get(v, name), rest)));
  } else {
    return collect(_.get(vars, name), rest);
  }
}
