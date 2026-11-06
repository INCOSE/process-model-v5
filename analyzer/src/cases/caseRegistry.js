import { Case1 } from './case1.js';
import { Case2 } from './case2.js';
import { Case3 } from './case3.js';
import { Case4 } from './case4.js';
import { Case5 } from './case5.js';
import { Case6 } from './case6.js';
import { Case7 } from './case7.js';

export const CaseRegistry = {
    [Case1.id]: Case1,
    [Case2.id]: Case2,
    [Case3.id]: Case3,
    [Case4.id]: Case4,
    [Case5.id]: Case5,
    [Case6.id]: Case6,
    [Case7.id]: Case7,
};

export const casesList = Object.values(CaseRegistry).map(c => ({
    id: c.id,
    name: c.name,
    description: c.description
}));