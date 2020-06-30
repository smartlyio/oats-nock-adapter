import * as fastCheck from 'fast-check';
import * as choice from './choice';

type Bs = 'ok' | 'fail';
describe('branch', () => {
  it('select', () =>
    fastCheck.assert(
      fastCheck.property(
        fastCheck.array(fastCheck.asciiString()),
        choice.branch<Bs>(),
        (ctxs, branch) => {
          const values = ctxs.map(ctx => branch.choice(ctx, () => ctx));
          expect(values).toEqual(ctxs);
        }
      )
    ));

  it('has trace eq', () =>
    fastCheck.assert(
      fastCheck.property(
        fastCheck.array(fastCheck.asciiString()),
        choice.branch<Bs>(),
        (ctxs, branch) => {
          function ch(c: choice.Choice<Bs, any>) {
            return c
              .option({
                tag: 'first',
                behaviours: ['ok'],
                fn: () => '1'
              })
              .option({ tag: 'second', behaviours: ['fail'], fn: () => '0' })
              .run();
          }
          const values = ctxs.map(ctx => branch.choice(ctx, ch));
          const branch2 = branch[fastCheck.cloneMethod]();
          const values2 = ctxs.map(ctx => branch2.choice(ctx, ch));
          expect(values).toEqual(values2);
        }
      )
    ));
});

describe('choice', () => {
  function model(c: choice.Choice<Bs, number>) {
    return c
      .option({
        tag: 'first',
        behaviours: ['ok'],
        fn: branch => {
          return branch.value(fastCheck.constant(1));
        }
      })
      .option({
        tag: 'second',
        behaviours: ['fail'],
        fn: branch => {
          return branch.value(fastCheck.constant(0));
        }
      });
  }

  it('allows choice and branching', () =>
    fastCheck.assert(
      fastCheck.property(choice.choice<Bs, number>(), c => {
        const value = model(c).run();
        expect(typeof value).toEqual('number');
      })
    ));

  it('can be cloned', () =>
    fastCheck.assert(
      fastCheck.property(choice.choice<Bs, number>(), c => {
        const trace = [];
        for (let a = 0; a < 100; a++) {
          const value = model(c).run();
          trace.push(value);
        }
        const c2 = c[fastCheck.cloneMethod]();
        const trace2 = [];
        for (let a = 0; a < 100; a++) {
          const value = model(c2).run();
          trace2.push(value);
        }
        expect(trace).toEqual(trace2);
      })
    ));

  it('uses both braches', () =>
    fastCheck.assert(
      fastCheck.property(choice.choice<'ok' | 'fail', number>(), c => {
        const trace = [];
        for (let a = 0; a < 100; a++) {
          const value = model(c).run();
          trace.push(value);
        }
        expect(trace).toContainEqual(1);
        expect(trace).toContainEqual(0);
      })
    ));

  it('can be filtered', () =>
    fastCheck.assert(
      fastCheck.property(
        choice.choice<'ok' | 'fail', number>(bs => bs.some(b => b === 'fail')),
        c => {
          const hits = [0, 0];
          for (let a = 0; a < 100; a++) {
            const value = model(c).run();
            hits[value]++;
          }
          expect(hits[0]).toBeGreaterThan(0);
          expect(hits[1]).toEqual(0);
        }
      )
    ));
});
