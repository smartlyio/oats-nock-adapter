import * as assert from 'assert';
import * as fastCheck from 'fast-check';

export class Branch<Behaviour> {
  private choices: Record<string, Choice<Behaviour, unknown>> = {};
  private readonly originalMrng: fastCheck.Random;
  private shrinkable: fastCheck.Shrinkable<unknown> | undefined;
  private arb: fastCheck.Arbitrary<unknown> | undefined;

  constructor(
    private readonly behaviours: BehaviourFilter<Behaviour>,
    private readonly mrng: fastCheck.Random,
    private readonly freq: number
  ) {
    this.originalMrng = this.mrng.clone();
  }

  toString(): string {
    return (
      'Branch: ' +
      JSON.stringify(
        Object.keys(this.choices).reduce(
          (memo, key) => ({ ...memo, [key]: this.choices[key].toString() }),
          {}
        ),
        null,
        4
      )
    );
  }

  choice<Result>(ctx: string, fn: ChoiceFn<Behaviour, Result>): Result {
    const choice = this.choices[ctx];
    if (!choice) {
      this.choices[ctx] = new Choice(this.behaviours, this.mrng, this.freq);
    }
    return fn(this.choices[ctx] as Choice<Behaviour, Result>);
  }
  clone(mrng?: fastCheck.Random): Branch<Behaviour> {
    const clone = new Branch<Behaviour>(this.behaviours, mrng || this.mrng, this.freq);
    clone.choices = Object.keys(this.choices).reduce(
      (memo, key) => ({ ...memo, [key]: this.choices[key].clone() }),
      {}
    );
    clone.shrinkable = this.shrinkable;
    clone.arb = this.arb;
    return clone;
  }

  [fastCheck.cloneMethod] = (): Branch<Behaviour> => {
    return this.clone(this.originalMrng.clone());
  };

  value<Value>(gen: fastCheck.Arbitrary<Value>): Value {
    if (gen !== this.arb) {
      this.shrinkable = undefined;
    }
    if (!this.shrinkable) {
      this.shrinkable = gen.withBias(this.freq).generate(this.mrng);
      this.arb = gen;
    }
    return this.shrinkable.value as Value;
  }
}
type ChoiceFn<Behaviour, Result> = (choice: Choice<Behaviour, Result>) => Result;
type BranchFn<Behaviour, Result> = (branch: Branch<Behaviour>) => Result;
type BehaviourFilter<Behaviour> = (behaviours: Behaviour[]) => boolean;

interface Option<Behaviour, Result> {
  tag: string;
  behaviours: Behaviour[];
  fn: BranchFn<Behaviour, Result>;
}

export class Choice<Behaviour, Result> {
  private selections: Array<{ branch: Branch<Behaviour>; index: number; tag: string }> = [];
  private position = 0;
  private options: Array<Option<Behaviour, Result>> = [];
  private readonly originalMrng: fastCheck.Random;
  private shrinkable: fastCheck.Shrinkable<unknown> | undefined;
  private arb: fastCheck.Arbitrary<unknown> | undefined;

  constructor(
    public readonly behaviours: BehaviourFilter<Behaviour>,
    private readonly mrng: fastCheck.Random,
    private readonly freq: number
  ) {
    this.originalMrng = this.mrng.clone();
  }

  value<Value>(gen: fastCheck.Arbitrary<Value>): Value {
    if (gen !== this.arb) {
      this.shrinkable = undefined;
    }
    if (!this.shrinkable) {
      this.shrinkable = gen.withBias(this.freq).generate(this.mrng);
      this.arb = gen;
    }
    return this.shrinkable.value as Value;
  }

  toString(): string {
    return (
      'Choice: ' +
      this.selections
        .map(selection => selection.tag + '  ' + selection.branch.toString())
        .join('\n')
    );
  }

  option(opts: Option<Behaviour, Result>): this {
    this.options.push(opts);
    return this;
  }

  clone(mrng?: fastCheck.Random): Choice<Behaviour, Result> {
    const clone = new Choice<Behaviour, Result>(this.behaviours, mrng || this.mrng, this.freq);
    clone.selections = this.selections.map(selection => ({
      branch: selection.branch.clone(),
      index: selection.index,
      tag: selection.tag
    }));
    clone.position = 0;
    clone.shrinkable = this.shrinkable;
    clone.arb = this.arb;
    return clone;
  }

  [fastCheck.cloneMethod] = (): Choice<Behaviour, Result> => {
    return this.clone(this.originalMrng.clone());
  };

  run(): Result {
    if (this.position >= this.selections.length) {
      const options = this.options
        .map((option, index) => ({ option, index }))
        .filter(branch => this.behaviours(branch.option.behaviours));
      assert(options.length >= 1, 'no branches match filter');
      const pick = Math.floor(Math.random() * options.length);
      const branch = new Branch<Behaviour>(this.behaviours, this.mrng, this.freq);
      this.selections.push({ index: options[pick].index, branch, tag: options[pick].option.tag });
    }
    const { branch, index } = this.selections[this.position++];
    const options = this.options;
    this.options = [];
    return (options[index].fn || assert.fail('missing branch fn'))(branch);
  }
}

export function branch<Behaviour>(
  behaviourFilter?: BehaviourFilter<Behaviour>
): BranchArbitrary<Behaviour> {
  return new BranchArbitrary<Behaviour>(behaviourFilter);
}

export class BranchArbitrary<Behaviour> extends fastCheck.Arbitrary<Branch<Behaviour>> {
  constructor(
    private readonly behaviours: BehaviourFilter<Behaviour> = () => true,
    private readonly bias: number = 1
  ) {
    super();
  }

  withBias(freq: number) {
    return new BranchArbitrary<Behaviour>(this.behaviours, freq);
  }

  generate(mrng: fastCheck.Random) {
    const branch = new Branch<Behaviour>(this.behaviours, mrng.clone(), this.bias);
    return fastCheck.clonedConstant(branch).generate(mrng);
  }
}

export function choice<Behaviour, Result>(
  behaviourFilter?: BehaviourFilter<Behaviour>
): ChoiceArbitrary<Behaviour, Result> {
  return new ChoiceArbitrary<Behaviour, Result>(behaviourFilter);
}

export class ChoiceArbitrary<Behaviour, Result> extends fastCheck.Arbitrary<
  Choice<Behaviour, Result>
> {
  constructor(
    private readonly behaviours: BehaviourFilter<Behaviour> = () => true,
    private readonly bias: number = 1
  ) {
    super();
  }

  withBias(freq: number) {
    return new ChoiceArbitrary<Behaviour, any>(this.behaviours, freq);
  }

  generate(mrng: fastCheck.Random) {
    const choice = new Choice<Behaviour, any>(this.behaviours, mrng.clone(), this.bias);
    return fastCheck.clonedConstant(choice).generate(mrng);
  }
}
