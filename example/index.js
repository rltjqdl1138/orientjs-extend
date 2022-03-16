const orientdb = require('../lib/index')

const db = new orientdb.db()

async function run(){

  await db.init({
    "user": "",
    "database": "",
    "host": "",
    "password": "",
  })
  
}

run()