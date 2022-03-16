
const orientdb = require('orientjs-extend')

const db = new orientdb.db()

async function run(){
  await db.init({
    "user": "",
    "database": "",
    "host": "",
    "password": "",
  })

  await db.RegisterItem('animal', { name: 'dog' })
  await db.RegisterItem('animal', { name: 'cat' })
  await db.RegisterItem('animal', { name: 'cow' })
  await db.RegisterItem('animal', { name: 'chicken' })
  await db.RegisterItem('animal', { name: 'pig' })
  await db.RegisterItem('animal', { name: 'turtle' })
  await db.RegisterItem('animal', { name: 'rabbit' })
  await db.RegisterItem('animal', { name: 'goat' })
  await db.RegisterItem('animal', { name: 'sheep' })
  await db.RegisterItem('animal', { name: 'bear' })
  await db.RegisterItem('animal', { name: 'mouse' })
  await db.RegisterItem('animal', { name: 'snake' })
  await db.RegisterItem('animal', { name: 'horse' })
  await db.RegisterItem('animal', { name: 'spider' })
  await db.RegisterItem('animal', { name: 'deer' })
  await db.RegisterItem('animal', { name: 'duck' })
  await db.RegisterItem('animal', { name: 'monkey' })
  await db.RegisterItem('animal', { name: 'tiger' })
  await db.RegisterItem('animal', { name: 'wolf' })
  await db.RegisterItem('animal', { name: 'fox' })
  await db.RegisterItem('animal', { name: 'frog' })
  await db.RegisterItem('animal', { name: 'lion' })
  await db.RegisterItem('animal', { name: 'elephant' })

}
