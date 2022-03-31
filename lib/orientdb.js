import fs from 'fs';
import { dirname } from 'path';

import { OrientDBClient } from 'orientjs';
import Graph from './graph';

const BROWSE_PLAIN_CLASS = 'SELECT name, superClass, properties FROM ( SELECT EXPAND(classes) from metadata:schema )';
const SYSTEM_CLASS = ['OFunction', 'OTriggered', 'OSequence', 'OShape', 'OSecurityPolicy', 'OSchedule', 'ORestricted', 'OIdentity', 'OSequence', 'OTriggered', 'OSecurityPolicy', 'OShape', 'OSchedule', 'OIdentity', 'ORestricted', '_studio'];
const DATA_TYPES = ['', 'INTEGER', '', 'LONG', '', '', 'DATETIME', 'STRING', ''];

const appDir = dirname(require.main.filename);
// const OrientDBClient = require("orientjs").OrientDBClient;
// const Graph = require('./graph')

/*
 * @class   Database
 * @brief   Parents class for OrientDB
 * @author  jigugong Inc, Kim ki seop
 *
* */
class Database {
  constructor() {
    this.models = {};
  }

  init(data) {
    // Read Classes from file
    if (data.readModelFile) {
      return this.initializeDB(data)
        .then((success) => success && this.getClassesFromFile(data.readModelPath))
        .then(() => this.updateClasses());
    }
    // Read Classes from Database

    return this.initializeDB(data)
      .then((success) => success && this.loadClasses())
      .then((classes) => this.getClassesFromDB(classes));
  }

  async initializeDB({
    host, port, user, password, database,
  }) {
    const sessionOption = {
      name: database,
      username: user,
      password,
    };
    const connectOption = {
      host: host || '127.0.0.1',
      port: port || 2424,
    };
    try {
      this.db = await OrientDBClient.connect(connectOption);
      this.dbSession = await this.db.session(sessionOption);
      this.ready = true;
      return true;
    } catch (e) {
      if (this.dbSession) this.dbSession.close();
      this.dbSession = null;
      if (this.db) this.db.close();
      this.db = null;
      return false;
    }
  }

  getClassesFromDB(classes) {
    const setting = ({ name: className, properties, superClass }) => {
      this.models[className] = {
        name: className,
        extend: superClass,
      };
      this.models[className].attributes = properties.reduce((prev, {
        mandatory, name, type, default: defaultValue,
      }) => ({
        ...prev,
        [name]: {
          required: mandatory,
          type: DATA_TYPES[type],
          default: defaultValue,
        },
      }), {});
    };
    classes.forEach((e) => setting(e));
  }

  getClassesFromFile(rootPath) {
    const LoadModels = (path) => {
      const pathname = `${appDir}/${path}`;
      const files = fs.readdirSync(pathname, { withFileTypes: true });
      files.forEach((file) => {
        if (file.isDirectory()) {
          LoadModels(path + file.name);
        } else if ((file.name.match(/\.json$/) !== null)) {
          const model = fs.readFileSync(`${pathname}/${file.name}`);
          const { name } = JSON.stringify(model);
          if (name.length > 0) this.models = { ...this.models, [name]: model };
        }
      });
    };
    LoadModels(rootPath);
  }

  async loadClasses() {
    const classes = await this.query(BROWSE_PLAIN_CLASS);
    return classes.filter((e) => !SYSTEM_CLASS.find((v) => v === e.name || v === e.superClass));
  }

  async updateClasses() {
    const classes = await this.loadClasses();
    const classNames = classes.map((e) => e.name);
    const deprecated = classes
      .filter((e) => !this.models[e.name])
      .map((e) => this.removeClass(e));

    const newClass = Object
      .values(this.models)
      .filter((e) => !classNames.includes(e.name))
      .map((e) => this.createClass(e));

    const oldClass = classes
      .filter((e) => this.models[e.name])
      .map((e) => this.updateClass(e));

    await Promise.all([...deprecated, ...newClass, ...oldClass]);
  }

  async createClass({ name, extend, attributes }) {
    Database.log(`[init] CREATE CLASS ${name}`);
    let result;
    if (!extend || typeof extend !== 'string') {
      result = await this.command(`CREATE CLASS ${name} IF NOT EXISTS`);
    } else if (extend === 'V' || extend === 'E' || this.models[extend]) {
      result = await this.command(`CREATE CLASS ${name} IF NOT EXISTS EXTENDS ${extend}`);
    } else {
      throw Error(`${extend} class is not defined`);
    }

    const newProperties = Object
      .entries(attributes)
      .map((e) => this.createProperty(name, ...e));
    await Promise.all(newProperties);

    if (result && attributes.id) {
      const created = await this.command(`CREATE SEQUENCE ${name}_idseq IF NOT EXISTS TYPE ORDERED`);
      if (!created) await this.command(`ALTER SEQUENCE ${name}_idseq START 0`);
    }
    Database.log(`[init] CREATE CLASS ${name}`);
  }

  async removeClass({ name }) {
    if (name === 'V' || name === 'E' || SYSTEM_CLASS.includes(name)) return;
    try {
      await this.command(`DROP CLASS ${name}`);
      await this.command(`DROP SEQUENCE ${name}_idseq IF EXISTS`);
      Database.log(`[init] DROP CLASS ${name}`);
    } catch (e) {
      // if data is exist in class, pass the drop sequence

    }
  }

  async updateClass({ name, properties }) {
    const { attributes } = this.models[name];
    const names = properties.map((e) => e.name);

    const deprecated = properties
      .filter((e) => !attributes[e.name])
      .map((e) => this.removeProperty(name, e.name));

    const newProperties = Object
      .entries(attributes)
      .filter(([key]) => !names.includes(key))
      .map(([nameInProperty, val]) => ({ ...val, name: nameInProperty }))
      .map((e) => this.createProperty(name, e.name, e));

    await Promise.all([...deprecated, ...newProperties]);
  }

  createProperty(className, propertyName, { type, required }) {
    const QUERY = `CREATE PROPERTY ${className}.${propertyName} ${type}`;
    const MANDATORY = required ? ' (MANDATORY TRUE)' : '';

    Database.log(`[init] ${QUERY}`);
    return this.command(QUERY + MANDATORY);
  }

  removeProperty(className, propertyName) {
    const QUERY = `DROP PROPERTY ${className}.${propertyName}`;

    Database.log(`[init] ${QUERY}`);
    return this.command(QUERY);
  }

  async query(query, params) {
    try {
      if (!this.dbSession || !this.ready) {
        throw new Error('0');
      }
      return await this.dbSession.query(query, { params }).all();
    } catch (e) {
      this.ErrorHandler(e, query, params);
      return undefined;
    }
  }

  async command(query, params) {
    try {
      if (!this.dbSession || !this.ready) {
        throw new Error('0');
      }
      return await this.dbSession.command(query, { params }).one();
    } catch (e) {
      this.ErrorHandler(e, query, params);
      return undefined;
    }
  }

  ErrorHandler(error, query, params) {
    if (error === 10) {
      this.ready = false;
      this.reconnect();
    } else {
      Database.log(query);
      Database.log(params);
    }
    throw new Error(error);
  }

  static log(str) {
    console.log(`[Database] ${str}`);
  }

  graphQuery(model) {
    return new Graph(model, this);
  }

  async RegisterItem(model, _attrs) {
    const now = Number(new Date());
    const attrs = {
      ..._attrs,
      created_at: now,
      updated_at: now,
    };
    const Model = {
      id: model,
      attrs,
      extraAttr: null,
    };
    const result = await this.createQuery(Model);
    return result;
  }

  async GetItem(model, attrs, where) {
    const Model = {
      id: model,
      attrs,
      extraAttr: null,
    };
    const result = await this.itemQuery(Model, where);
    return result;
  }

  async UpdateItem(model, attrs, id) {
    const now = Number(new Date());
    const Model = {
      id: model,
      attrs: { ...attrs, updated_at: now },
      extraAttr: null,
    };
    const result = await this.updateQuery(Model, Number(id));
    return result;
  }

  async DeleteItem(model, id) {
    const Model = {
      id: model,
      attrs: null,
      extraAttr: null,
    };
    const result = await this.deleteQuery(Model, Number(id));
    return result;
  }

  async itemQuery(_model, _where) {
    const { id, extraAttr } = _model;
    let { attrs } = _model;
    const basicAttributes = [];
    let model = this.models[id];
    if (!model) return undefined;
    while (model && model !== 'V' && model !== 'E') {
      basicAttributes.push(...Object.keys(model.attributes));
      model = this.models[model.extend] || null;
    }

    if(!attrs) attrs = []
    if (attrs.length > 0 && typeof attrs === 'object') {
      attrs = attrs.filter((e) => basicAttributes.includes(e));
    }
    if (!attrs.length) attrs = basicAttributes;
    if (extraAttr) {
      attrs.push(...Object.entries(extraAttr).map(([key, value]) => `${value} as ${key}`));
    }

    const SelectQuery = attrs ? attrs.join(',') : '*';

    // * Select
    try {
      let whereQuery = '';
      if (typeof _where === 'string') whereQuery = `WHERE ${_where}`;
      else if (typeof _where === 'number') whereQuery = `WHERE id=${_where}`;

      const query = `SELECT ${SelectQuery} FROM ${id} ${whereQuery}`;
      // Run
      const queryPromise = this.query(query);
      const result = await queryPromise;
      return result[0];
    } catch (e) {
      return undefined;
    }
  }

  async simpleCount(where, id) {
    const whereOption = where.length ? `WHERE ${where}` : '';
    try {
      const query = `SELECT COUNT(*) AS count FROM ${id} ${whereOption}`;
      const result = await this.query(query) || [{ count: 0 }];
      return result[0].count;
    } catch (e) {
      return 0;
    }
  }

  async getList(_model, option = {}) {
    const { id, where } = _model;
    let {
      name, attrs, extraAttr,
    } = _model;
    const {
      page, skip, limit, order, sort,
    } = option;

    let model = this.models[id];
    if (!model) return undefined;

    if (!name.length) name = id;
    else if (typeof name !== 'string') name = id;

    const basicAttributes = [];

    while (model && model !== 'V' && model !== 'E') {
      basicAttributes.push(...Object.keys(model.attributes));
      model = this.models[model.extend] || null;
    }

    if(!attrs) attrs = []
    if (attrs.length > 0 && typeof attrs === 'object') {
      attrs = attrs.filter((e) => basicAttributes.includes(e));
    }

    if (!attrs.length) attrs = basicAttributes;
    if (!extraAttr) extraAttr = {};

    // * Select
    const extraSelect = Object.entries(extraAttr).map(([key, val]) => `${val} as ${key}`);
    const select = [...attrs, ...extraSelect].join(',');

    let limitOption = '';
    if (!limit);
    else if (skip !== undefined) limitOption = `SKIP ${skip} LIMIT ${limit}`;
    else if (page !== undefined) limitOption = `SKIP ${page * limit} LIMIT ${limit}`;

    const orderOption = sort && order ? `ORDER BY ${sort} ${order}` : '';
    const whereOption = where.length ? `WHERE ${where}` : '';

    const query = `SELECT @rid, ${select} FROM ${id} ${whereOption} ${orderOption} ${limitOption}`;
    // Run
    const queryPromise = this.query(query);
    const countPromise = this.simpleCount(where, id);
    const result = await queryPromise;
    const count = await countPromise;

    const pagination = limitOption && Database.pagingResponseParse({
      current: page, total: count, limit, sort, order,
    });
    return { items: result, pagination };
  }

  createQuery(_model) {
    const { id, attrs } = _model;

    let model = this.models[id];

    let idSeq = model.name;
    let extend;
    if (!model) return undefined;

    let attributes = {};
    // set default values
    while (model) {
      idSeq = model.name;
      attributes = Object
        .entries(model.attributes)
        .reduce((prev, [key, attr]) => {
          const defaultValue = attr.default;
          if (defaultValue !== undefined && attrs[key] === undefined) { attrs[key] = defaultValue; }
          return {
            ...prev,
            [key]: defaultValue === undefined ? null : defaultValue,
          };
        }, attributes);

      if (model.extend === 'V') {
        extend = 'VERTEX';
        break;
      } else if (model.extend === 'E') {
        throw new Error('createQuery 함수는 edge를 생성할 때 쓸 수 없습니다.');
      }
      model = this.models[model.extend] || null;
    }

    let idQuery = '';
    if (attributes.id !== undefined) {
      delete attributes.id;
      idQuery = `id=sequence('${idSeq}_idseq').next(),`;
    }
    const SetQuery = idQuery + Object
      .keys(attributes)
      .map((key) => `${key}=:${key}`)
      .join(',');

    const InsertQuery = extend === 'VERTEX' ? 'CREATE VERTEX' : 'INSERT INTO';

    const query = `${InsertQuery} ${id} SET ${SetQuery}`;
    return this.command(query, attrs);
  }

  static pagingResponseParse(pageObject) {
    const {
      current, total, limit, sort, order,
    } = pageObject;
    let prevPage = null;
    let nextPage = null;
    let lastPage = null;
    const currentPage = current;
    if (typeof total === 'number') {
      if (total === 0) lastPage = 0;
      else lastPage = Math.floor((total - 1) / limit);
      prevPage = lastPage >= current && current > 0 ? current - 1 : null;
      nextPage = lastPage <= current ? null : current + 1;
    }

    return {
      firstPage: 0,
      prevPage,
      currentPage,
      nextPage,
      lastPage,
      limit,
      total,
      sort,
      order,
    };
  }
}

export default Database;
