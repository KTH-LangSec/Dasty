const obj = {};

const blub = obj.blub || 'flub';

while(!blub) {
    console.log('hey');
}