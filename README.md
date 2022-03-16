# orientjs-extend
ORM for orientdb node.js

# Features

# Installing
Using npm:
```
npm install orientjs-extend
```

# Initialize

```
const orientdb = require('orientjs-extend')
const db = new orientdb.db()

db.init({
  host: "127.0.0.1",
  port: 2424,
  database: "demodb",
  user: "root",
  password: "...",
  readModelFile": false,
})
```

## Define class schema

#### main.js

```
const orientdb = require('orientjs-extend')
const db = new orientdb.db()

db.init({
  host: "127.0.0.1",
  port: 2424,
  database: "demodb",
  user: "root",
  password: "...",
  readModelFile": true,
  readModelPath:"./models"
})
```

if "readModelFile" is true, try to synchronize database ( Local -> DB )
- Create or Delete class. if data is in class, it can not delete class
- Create or Delete property

There are predefined properties
- id: (LONG) Auto-increasing sequence
- created_at: (DATETIME) timestamp when data is created
- updated_at: (DATETIME) timestamp when data is updated

#### js file

```
// models/animal.js
const extend = 'V'
const name = 'animal'
const attributes = {
  id: { type:'LONG', required:true },
  name:{type:'STRING', required: true},
  created_at:{ type:'DATETIME', required:true },
  updated_at:{ type:'DATETIME', required:true },
}

module.exports={
    name, 
    attributes,
    extend
}
```

#### json file

```
{
  "extend":"V",
  "name":"animal",
  "attributes":{
    "id":{"type":"LONG", "required":true},
    "name":{"type":"STRING", "required":true},
    "created_at":{"type":"DATETIME", "required":true},
    "updated_at":{"type":"DATETIME", "required":true}
  }
}
```


# Example

#### create item
```
async function run(){
  const args = { name: 'dog' }
  await db.RegisterItem('animal', args)
}
run()
```


#### find one by id

```
async function run(){
  const id = 1
  const attrs1 = null // null means SELECT all
  const data1 = await db.GetItem('animal', attrs1, id)
  /*
  {
    '@class': 'animal',
    id: 1,
    name: 'dog',
    created_at: 2022-03-16T07:11:28.042Z,
    updated_at: 2022-03-16T07:11:28.042Z,
    '@rid': RecordID { cluster: 20, position: 0 },
    '@version': 1
  }
  */
  
  const attrs2 = ['id','name']
  const data2 = await db.GetItem('animal', attrs2, id)
  /*
  {
    id: 1,
    name: 'dog'
  }
  */
}
run()
```

#### list items

```
async function run(){
  const model = {
    id: 'animal',
    attrs: ['id','name'],
  }
  const option = {
    page: 0,
    limit: 5,
    order: 'desc',
    sort: 'created_at'
  }
  
  const {items, pagination} = await db.getList(model, option)
  
  console.log(items)
  /*
  [
    {
      '@rid': RecordID { cluster: 20, position: 11 },
      name: 'elephant',
      id: 23
    },
    {
      '@rid': RecordID { cluster: 21, position: 10 },
      name: 'lion',
      id: 22
    },
    {
      '@rid': RecordID { cluster: 20, position: 10 },
      name: 'frog',
      id: 21
    },
    {
      '@rid': RecordID { cluster: 21, position: 9 },
      name: 'fox',
      id: 20
    },
    {
      '@rid': RecordID { cluster: 20, position: 9 },
      name: 'wolf',
      id: 19
    }
  ]
  */
  
  console.log(pagination)
  /*
  {
    firstPage: 0,
    prevPage: null,
    currentPage: 0,
    nextPage: 1,
    lastPage: 4,
    limit: 5,
    total: 23,
    sort: 'created_at',
    order: 'desc'
  }
  */
}

run()
```

