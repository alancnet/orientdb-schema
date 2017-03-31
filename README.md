# orientdb-schema

Deploys a schema to an OrientDB database.

## Usage:

```
const schemaMaker = require('orientdb-schema');
const { ODatabase } = require('orientjs');

const db = new ODatabase(...);

const plan = schemaMaker(db, [
  {
    "name": "Player",
    "superClass": "V",
    "properties": [
      { "name": "name", "type": "String" },
      ...
    ]
  },
  ...
]);

console.log(plan.explain());

plan.execute().then(() => {
  console.log("Done!");
  db.close();
});
```
