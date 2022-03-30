class Graph {
  constructor(_model, orientdb) {
    const model = Graph.parseModel(_model);
    this.select = model.select;
    this.name = model.name;
    this.match = model.match;

    this.orientdb = orientdb;
  }

  In(_edge, _nextModel) {
    const nextModel = Graph.parseModel(_nextModel);
    const edge = _edge.length ? `'${_edge}'` : '';
    this.select.push(nextModel.select);
    this.name.push(nextModel.name);
    this.match = `${this.match}.in(${edge})${nextModel.match}`;
    return this;
  }

  InE(_edge, _nextModel) {
    const nextModel = Graph.parseModel(_nextModel);
    const edge = _edge.length ? `'${_edge}'` : '';
    this.select.push(nextModel.select);
    this.name.push(nextModel.name);
    this.match = `${this.match}.inE(${edge})${nextModel.match}`;
    return this;
  }

  InV(_edge, _nextModel) {
    const nextModel = Graph.parseModel(_nextModel);
    const edge = _edge.length ? `'${_edge}'` : '';
    this.select.push(nextModel.select);
    this.name.push(nextModel.name);
    this.match = `${this.match}.inV(${edge})${nextModel.match}`;
    return this;
  }

  Out(_edge, _nextModel) {
    const nextModel = Graph.parseModel(_nextModel);
    const edge = _edge.length ? `'${_edge}'` : '';
    this.select.push(nextModel.select);
    this.name.push(nextModel.name);
    this.match = `${this.match}.out(${edge})${nextModel.match}`;
    return this;
  }

  OutE(_edge, _nextModel) {
    const nextModel = Graph.parseModel(_nextModel);
    const edge = _edge.length ? `'${_edge}'` : '';
    this.select.push(nextModel.select);
    this.name.push(nextModel.name);
    this.match = `${this.match}.outE(${edge})${nextModel.match}`;
    return this;
  }

  OutV(_edge, _nextModel) {
    const nextModel = Graph.parseModel(_nextModel);
    const edge = _edge.length ? `'${_edge}'` : '';
    this.select.push(nextModel.select);
    this.name.push(nextModel.name);
    this.match = `${this.match}.outV(${edge})${nextModel.match}`;
    return this;
  }

  async Run(option = {}) {
    const {
      page, skip, limit, order, sort, where,
    } = option;
    const orderOption = sort && order ? `ORDER BY ${sort} ${order}` : '';
    const whereOption = where.length ? `WHERE ${where}` : '';

    let limitOption = '';
    if (!limit);
    else if (skip !== undefined) limitOption = `SKIP ${skip} LIMIT ${limit}`;
    else if (page !== undefined) limitOption = `SKIP ${limit * page} LIMIT ${limit}`;

    const { match } = this;
    const select = this.select.join(',');
    const name = this.name.join(',');
    const query = `SELECT ${select} FROM (MATCH ${match} RETURN ${name}) ${whereOption} ${orderOption} ${limitOption}`;

    // Run
    const queryPromise = this.orientdb.query(query);
    const countPromise = this.Count(where);
    const result = await queryPromise;
    const count = await countPromise;

    const items = result.map((e) => this.parseObject(e));

    const pagination = limitOption && this.orientdb.pagingResponseParse({
      current: page, total: count, limit, sort, order,
    });
    return { items, pagination };
  }

  async Count(where) {
    const whereOption = where.length ? `WHERE ${where}` : '';
    try {
      const { match } = this;
      const name = this.name.join(',');
      const query = `SELECT COUNT(*) AS count FROM (MATCH ${match} RETURN ${name}) ${whereOption}`;
      const result = await this.orientdb.query(query) || [{ count: 0 }];
      return result[0].count;
    } catch (e) {
      return 0;
    }
  }

  static parseObject(item) {
    return Object
      .entries(item)
      .reduce((prev, [key, value]) => {
        const parsedKey = key.split('__');
        const className = parsedKey[0];
        let propertyName = parsedKey[1];
        if (propertyName === 'rid') propertyName = '@rid';
        const properties = prev[className] || {};
        return { ...prev, [className]: { ...properties, [propertyName]: value } };
      }, {});
  }

  static parseModel(_model) {
    const { id } = _model;
    let {
      name, where, attrs, extraAttr,
    } = _model;
    let model = this.orientdb.models[id];
    if (!model) return {};

    if (!name.length) name = id;
    else if (typeof name !== 'string') name = id;

    const basicAttributes = [];

    while (model && model !== 'V' && model !== 'E') {
      basicAttributes.push(...Object.keys(model.attributes));
      model = this.orientdb.models[model.extend] || null;
    }

    if (attrs.length > 0 && typeof attrs === 'object') {
      attrs = attrs.filter((e) => basicAttributes.includes(e));
    }

    if (!attrs.length) attrs = basicAttributes;
    if (!extraAttr) extraAttr = {};

    if (typeof where === 'string' && where.length > 0) where = `(${where})`;
    else where = null;

    // * Select
    const simpleSelect = attrs.map((attr) => `${name}.${attr} as ${name}__${attr}`);
    const extraSelect = Object.entries(extraAttr).map(([key, val]) => `${val} as ${name}__${key}`);
    const select = [`${name}.@rid as ${name}__rid`, ...simpleSelect, ...extraSelect].join(',');
    // * Match
    let match = [`class:${id}`];
    if (name) match.push(`as:${name}`);
    if (where) match.push(`where:${where}`);
    match = `{${match.join(',')}}`;

    return {
      select,
      name,
      match,
    };
  }
}

export default Graph;
