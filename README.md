# orientjs-extend
ORM for orientdb node.js

# Features

# Installing
Using npm:
``` bash
npm install orientjs-extend
```

# Initialize

``` js
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

``` js
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

``` js
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

``` js
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
``` js
async function run(){
  const args = { name: 'dog' }
  await db.RegisterItem('animal', args)
}
run()
```


#### find one by id

``` js
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

``` js
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
  console.log(pagination)
  /*
  [
    {
      '@rid': RecordID { cluster: 20, position: 6 },
      name: 'horse',
      id: 13
    },
    ...
  ]
  */
}

run()
```


#### response schema

``` js
{
  items:[
    ...
  ],
  pagination: {
    firstPage: 0,   // first page. 
    prevPage: 1,    // previous page. if it is null, this response is first page
    currentPage: 2, // current page. it is equal to "page" in option
    nextPage: 3,    // next page. if it is null, this response is last page or over it
    lastPage: 4,    // last page.
    limit: 5,       // it is equal to "limit" in option
    total: 23,      // total records in database
    sort: 'created_at', // sort option
    order: 'desc'       // order option
  }
}
```
