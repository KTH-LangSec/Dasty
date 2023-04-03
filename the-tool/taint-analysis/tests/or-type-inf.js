const obj = {};

const or = obj.blub || obj.slub || 'oror'
const nullCoal = obj.flub ?? 'nullCoal';

console.log(or.toString(), !!or.__taint);
console.log(nullCoal.toString(), !!nullCoal.__taint);

const x = 10;
if (obj.cond || x === 5) {
    console.log('not reachable');
}

const intVal = obj.locals || Object.create(null);
if (intVal) {
    console.log('hey');
}