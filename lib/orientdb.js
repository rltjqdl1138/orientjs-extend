const fs = require('fs')
const { dirname } = require('path');
const appDir = dirname(require.main.filename);

const OrientDBClient = require("orientjs").OrientDBClient;
const Graph = require('./graph')

/*
 * @class   Database
 * @brief   Parents class for OrientDB
 * @author  jigugong Inc, Kim ki seop
 * 
**/
class Database{
  constructor(){
    this.models = {}
  }
  init(data){
    // Read Classes from file
    if(data.readModelFile){
      return this._initializeDB(data)
        .then((success)=> success && this.getClassesFromFile(data.readModelPath))
        .then(()=>this.updateClasses())
    }
    // Read Classes from Database
    else{
      return this._initializeDB(data)
        .then((success) => success && this.loadClasses())
        .then((classes) => this.getClassesFromDB(classes))
    }
    
  }

  async _initializeDB({host, port, user, password, database}){
    const sessionOption = {
      name: database,
      username: user,
      password: password
    }
    const connectOption = {
      host: host || "127.0.0.1",
      port: port || 2424
    }
    try{
      this.db = await OrientDBClient.connect(connectOption)
      this.dbSession = await this.db.session(sessionOption);
      this.ready = true;
      return true
    }
    catch(e){
      this.dbSession && this.dbSession.close()
      this.dbSession = null
      this.db && this.db.close()
      this.db = null
      return false
    }
  }

  getClassesFromDB(classes){
    const setting = ({name:className, properties, superClass})=>{
      this.models[className] = {
        name: className,
        extend: superClass
      }
      this.models[className].attributes = properties.reduce((prev, {mandatory, name, type, default:defaultValue} ) => ({
        ...prev,
        [name]:{
          required: mandatory,
          type: DATA_TYPES[type],
          default: defaultValue
        }
      }), {})
    }
    classes.forEach((e) => setting(e))
  }
  
  getClassesFromFile(rootPath){
    const LoadModels=(path)=>{
      const pathname = `${appDir}/${path}`
      const files = fs.readdirSync(pathname, { withFileTypes: true });
      for (const file of files) {
        if (file.isDirectory()){
          LoadModels(path+file.name)
        } else if (file.name.match(/\.js$/) !== null) {
          if(file.name === 'index.js') continue;
          const model = require(`${pathname}/${file.name}`);
          const name = model?.name
          if (name?.length > 0) this.models[name] = model
        } else if ((file.name.match(/\.json$/) !== null)){
          const model = require(`${pathname}/${file.name}`);
          const name = model?.name
          if (name?.length > 0) this.models[name] = model
        }
      }
    }
    LoadModels(rootPath)
  }

  async loadClasses(){
    const classes = await this.query(BROWSE_PLAIN_CLASS)
    return classes.filter((e) => !SYSTEM_CLASS.find((v)=> v === e.name || v === e.superClass))
  }

  async updateClasses(){
    const classes = await this.loadClasses()
    const classNames = classes.map((e) => e.name)
    const deprecated = classes
      .filter((e) => !this.models[e.name] )
      .map((e) => this.removeClass(e) )

    const newc = Object
      .values(this.models)
      .filter((e) => !classNames.includes(e.name) )

    const newClass = Object
      .values(this.models)
      .filter((e) => !classNames.includes(e.name) )
      .map((e) => this.createClass(e) )

    const oldClass = classes
      .filter((e) => this.models[e.name] )
      .map((e) => this.updateClass(e) )

    await Promise.all( [...deprecated, ...newClass, ...oldClass] )
  }

  async createClass({name, extend, attributes}){
    this.log(`[init] CREATE CLASS ${name}`)
    let result
    if (!extend || typeof extend !== 'string'){
      result = await this.command(`CREATE CLASS ${name} IF NOT EXISTS`)
    } else if (extend == 'V' || extend == 'E' || this.models[extend]){
      result = await this.command(`CREATE CLASS ${name} IF NOT EXISTS EXTENDS ${extend}`)
    } else{
      throw Error(`${extend} class is not defined`)
    }

    const newProperties = Object
      .entries(attributes)
      .map((e)=> this.createProperty(name, ...e))
    await Promise.all(newProperties)

    if(result && attributes?.id){
      await this.command(`CREATE SEQUENCE ${name}_idseq IF NOT EXISTS TYPE ORDERED`) || await this.command(`ALTER SEQUENCE ${name}_idseq START 0`)
    }
    this.log(`[init] CREATE CLASS ${name}`)
  }

  async removeClass({name}){
    if(name === 'V' || name === 'E' || SYSTEM_CLASS.includes(name) ) return;
    try{
      await this.command(`DROP CLASS ${name}`)
      await this.command(`DROP SEQUENCE ${name}_idseq IF EXISTS`)
      this.log(`[init] DROP CLASS ${name}`)
    }catch(e){
      // if data is exist in class, pass the drop sequence

    }
  }

  async updateClass({name, properties}){
    const {attributes} = this.models[name]
    const names = properties.map( e => e.name)

    const deprecated = properties
      .filter((e) => !attributes[e.name])
      .map((e) => this.removeProperty(name, e.name))
  
    const newProperties = Object
      .entries(attributes)
      .filter(([key]) => !names.includes(key))
      .map(([name, val]) => ({...val, name}))
      .map((e) => this.createProperty(name, e.name, e))

    await Promise.all( [...deprecated, ...newProperties] )
  }

  createProperty(className, propertyName, {type, required}){
    const QUERY = `CREATE PROPERTY ${className}.${propertyName} ${type}`
    const MANDATORY = required ? ' (MANDATORY TRUE)' : '' 
    
    this.log("[init] " + QUERY)
    return this.command(QUERY+MANDATORY)
  }

  removeProperty(className, propertyName){
    const QUERY = `DROP PROPERTY ${className}.${propertyName}`

    this.log("[init] " + QUERY)
    return this.command(QUERY)
  }

  async query(query, params){
    try{
      if(!this.dbSession || !this.ready){
        throw {status:500, message:'데이터베이스 로딩되지 않음'}
      }
      return await this.dbSession.query(query, {params}).all()
    }catch(e){
      this.ErrorHandler(e, query, params)
    }
  }

  async command(query, params){
    try{
      if(!this.dbSession || !this.ready){
        throw {status:500, message:'데이터베이스 로딩되지 않음'}
      }
      return await this.dbSession.command(query,{params}).one()
    }catch(e){
      this.ErrorHandler(e, query, params)
    }
  }

  ErrorHandler(error, query, params){
    if(error?.code === 10){
      this.ready = false
      this.reconnect()
    }
    else{
      this.log(query)
    }
    throw error
  }

  log(str){
    console.log(`[Database] ${str}`)
  }

  graphQuery(model){
    return new Graph(model, this)
  }

  async RegisterItem(model, _attrs){
    const now = Number( new Date() )
    const attrs = {
      ..._attrs,
      created_at: now,
      updated_at: now
    }
    const Model = {
      id:     model,
      attrs:  attrs,
      extraAttr:  null
    }
    return await this.createQuery(Model)
  }
  async GetItem( model, attrs, where ){
    const Model = {
      id:     model,
      attrs:  attrs,
      extraAttr:  null
    }
    return await this.itemQuery(Model, where )
  }
  async UpdateItem(model, attrs, id){
    const now = Number( new Date() )
    const Model = {
      id:     model,
      attrs:  { ...attrs, updated_at: now },
      extraAttr:  null,
    }
    return await this.updateQuery(Model, Number(id))
  }

  async DeleteItem( model, id ){
    const Model = {
      id:     model,
      attrs:  null,
      extraAttr:  null
    }
    return await this.deleteQuery(Model, Number(id))
  }
  
  async itemQuery(_model, _where){
    let { id, attrs, extraAttr } = _model
    let basicAttributes = []
    let model = this.models[id]
    if(!model) return;
    while(model && model !== "V" && model !== 'E'){
      basicAttributes.push( ...Object.keys(model.attributes) )
      model = this.models[model.extend] || null
    }
    
    if(attrs?.length > 0 && typeof attrs === 'object'){
      attrs = attrs.filter( e => basicAttributes.includes(e))
    }
    if(!attrs?.length) attrs = basicAttributes
    if(extraAttr){
      attrs.push(...Object.entries(extraAttr).map( ([key,value])=>`${value} as ${key}`))
    }
  
    const SelectQuery = attrs ? attrs.join(',') : "*"
    
    // * Select
    try{
      let whereQuery= ''
      if( typeof _where === 'string') whereQuery= `WHERE ${_where}`
      else if( typeof _where === 'number') whereQuery= `WHERE id=${_where}`

      const query = `SELECT ${SelectQuery} FROM ${id} ${whereQuery}`
      // Run
      const queryPromise = this.query(query)
      const result = await queryPromise
      return result[0]
    }catch(e){
      return undefined
    }

  }

  async simpleCount (where, id) {
    const whereOption = where?.length ? `WHERE ${where}` : ''
    try{
        const query = `SELECT COUNT(*) AS count FROM ${id} ${whereOption}`
        const result = await this.query(query) || [{count:0}]
        return result[0]?.count
    }catch(e){
        return 0
    }
  }

  
  async getList(_model, option={}){
    let { id, name, attrs, extraAttr, where} = _model
    const {page, skip, limit, order, sort} = option

    let model = this.models[id]
    if(!model) return;

    if(!name?.length) name = id
    else if(typeof name !== 'string') name = id
    
    let basicAttributes = []

    while(model && model !== "V" && model !== 'E'){
      basicAttributes.push( ...Object.keys(model.attributes) )
      model = this.models[model.extend] || null
    }

    if(attrs?.length > 0 && typeof attrs === 'object'){
      attrs = attrs.filter( e => basicAttributes.includes(e))
    }

    if(!attrs?.length) attrs = basicAttributes
    if(!extraAttr) extraAttr = {}

    // * Select
    const extraSelect = Object.entries(extraAttr).map(([key, val]) => `${val} as ${key}`)
    const select = [...attrs, ...extraSelect].join(',')

    let limitOption = ''
    if(!limit);
    else if(skip !== undefined) limitOption = `SKIP ${skip} LIMIT ${limit}` 
    else if(page !== undefined) limitOption = `SKIP ${page * limit} LIMIT ${limit}`
    
    const orderOption = sort && order ? `ORDER BY ${sort} ${order}` : ''
    const whereOption = where?.length ? `WHERE ${where}` : ''

    const query = `SELECT @rid, ${select} FROM ${id} ${whereOption} ${orderOption} ${limitOption}`
    // Run
    const queryPromise = this.query(query)
    const countPromise = this.simpleCount(where, id)
    const result = await queryPromise
    const count = await countPromise

    const pagination = limitOption && this.pagingResponseParse({current:page, total:count, limit, sort, order})
    return { items:result, pagination }
  }

  createQuery(_model){
    let {id, attrs, extraAttr} = _model

    let model = this.models[id]

    let id_seq = model.name
    let extend
    if(!model) return;

    let attributes = {}
    // set default values
    while(model){
      id_seq = model.name
      attributes = Object
        .entries(model.attributes)
        .reduce((prev, [key,attr])=>{
          const defaultValue = attr.default
          if(defaultValue !== undefined && attrs[key] === undefined)
            attrs[key] = defaultValue
          return {
            ...prev,
            [key]: defaultValue === undefined ? null : defaultValue
          }
      }, attributes)

      if(model.extend === 'V'){
        extend = 'VERTEX';
        break;
      }
      
      else if(model.extend === 'E'){
        throw {status:500, message:'createQuery 함수는 edge를 생성할 때 쓸 수 없습니다.'}
      }
      model = this.models[model.extend] || null
    }

    let idQuery = ''
    if(attributes.id !== undefined){
        delete attributes['id']
        idQuery = `id=sequence('${id_seq}_idseq').next(),`
    }
    const SetQuery = idQuery + Object
        .keys(attributes)
        .map( key => `${key}=:${key}`)
        .join(',')

    const InsertQuery = extend === 'VERTEX' ? 'CREATE VERTEX' : 'INSERT INTO'

    const query = `${InsertQuery} ${id} SET ${SetQuery}`
    return this.command(query, attrs)
  }

  pagingResponseParse(pageObject){
    const {current, total, limit, sort, order } = pageObject
    let prev_page = null
    let next_page = null
    let last_page = null
    
    if(typeof total === 'number'){
        if(total === 0) last_page = 0
        else last_page = Math.floor( (total-1)/limit )
        prev_page = last_page >= current && current > 0 ? current - 1 : null
        next_page = last_page <= current ? null : current + 1
    }

    return {
        firstPage:  0,
        prevPage:   prev_page,
        currentPage:current,
        nextPage:   next_page,
        lastPage:   last_page,
        limit,
        total:      total,
        sort,
        order
    }
  }
}

export const orientdb = Database

const BROWSE_PLAIN_CLASS = `SELECT name, superClass, properties FROM ( SELECT EXPAND(classes) from metadata:schema )`
const SYSTEM_CLASS = ["OFunction", "OTriggered", "OSequence", "OShape", "OSecurityPolicy", "OSchedule", "ORestricted", "OIdentity", "OSequence","OTriggered","OSecurityPolicy","OShape","OSchedule","OIdentity","ORestricted","_studio"]
const DATA_TYPES = ['','INTEGER','','LONG','','','DATETIME','STRING','']