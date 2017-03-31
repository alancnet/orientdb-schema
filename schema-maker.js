const _ = require('lodash')
const {types} = require('orientjs');

const diffList = (a, b) => ({
  common: a.map((x) => [x].concat(
    b.filter((y) => _.matches({x})({x:y}))
  ))
    .filter((x) => x.length - 1),
    //.reduce((a,b) => a.concat(b), []),
  left: a.map((x) => ({x})).filter((z) => !b.filter((x) => _.matches(z)({x})).length).map(({x}) => x),
  right: b.map((x) => ({x})).filter((z) => !a.filter((x) => _.matches(z)({x})).length).map(({x}) => x)
})

const diffListRef = (a, b, get) => {
  const cs = (a.length > b.length ? a : b).map(()=>({}));
  const ax = a.map((x, i) => [get(x), cs[i]])
  const bx = b.map((x, i) => [get(x), cs[i]])
  const diff = diffList(ax,bx)
  return {
    common: diff.common.map((group) =>
      group.slice(0, 1).map(([x, i]) => a[cs.indexOf(i)])
      .concat(group.slice(1).map(([x, i]) => b[cs.indexOf(i)]))
    ),
    left: diff.left.map(([x, i]) => a[cs.indexOf(i)]),
    right: diff.right.map(([x, i]) => b[cs.indexOf(i)])
  }
}

const isBuiltIn = (x) => x === 'V' || x === 'E' || x[0] === '_' || x[0] === 'O';

const diffSchemas = (db, targetSchema) => db.class.list().then((existingClasses) => {
  const classesDiff = diffListRef(existingClasses, targetSchema, (x) => x.name)
  return {
    newClasses: classesDiff.right,
    extraClasses: classesDiff.left
      .filter((x) => !isBuiltIn(x.name)),
    existingClasses: classesDiff.common.map(([currentClass,newClass]) => ({
      name: currentClass.name,
      class: currentClass,
      properties: diffListRef(
        currentClass.properties || [],
        newClass.properties || [],
        (x) => ({
          name: x.name,
          type: types[x.type] || x.type
        })
      )
    }))
  }
})

const schemaMaker = (db, targetSchema) =>
  diffSchemas(db, targetSchema)
    .then((diff) => {
      var steps = [];
      diff.extraClasses.forEach((c) => {
        steps.push({
          description: `Delete class ${c.name}.`,
          action: () => db.class.drop(c.name)
        })
      })
      diff.newClasses.forEach((c) => {
        steps.push({
          description: `Create class ${c.name}` +
            (c.superClass ? `, with superClass ${c.superClass}` : ``) +
            (c.properties && c.properties.length ? `, with properties: ` : ``) +
            (c.properties||[]).map((prop) => `${prop.type} ${prop.name}`).join(', ') +
            '.',
          action: () => {
            console.log('Creating class ', c.name, ':', c.superClass);
            return db.class.create(c.name, c.superClass)
              .then((cl) => {
                if (c.properties && c.properties.length)
                  return cl.property.create(c.properties)
                else
                  return Promise.resolve();
              }, console.error)
              .catch((err) => console.error(err))
          }

        })
      })

      diff.existingClasses.forEach((c) => {
        c.properties.left.forEach((p) => {
          steps.push({
            description: `Delete property ${types[p.type] || p.type} from ${c.name}.`,
            action: () =>
              c.class.property.drop(p.name)
          })
        })
        c.properties.right.forEach((p) => {
          steps.push({
            description: `Create property ${p.type} ${p.name} on ${c.name}.`,
            action: () =>
              c.class.property.create(p)
          })
        })
      })

      return {
        _diff: diff,
        explain: () => steps.map((x) => x.description).join('\n'),
        execute: () => {
          const queue = steps.slice(0);
          const next = () => {
            if (queue.length) {
              const step = queue.shift();
              console.log("Executing: ", step.description);
              return step.action().then(() => next())
            } else {
              return Promise.resolve("Done");
            }
          }
          return next();
        }
      }
    })


module.exports = schemaMaker
