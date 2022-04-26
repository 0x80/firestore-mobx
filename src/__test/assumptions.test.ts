import { action, autorun, makeObservable, observable, reaction } from "mobx";

/**
 * Testing some general assumptions about Mobx that I feel unclear about after
 * reading the docs.
 */
class TestStore {
  someArray: string[] = [];

  constructor() {
    makeObservable(this, {
      someArray: observable,
      add: action,
      replace: action,
    });
  }

  add(v: string) {
    this.someArray.push(v);
  }

  replace(v: string[]) {
    this.someArray = v;
  }
}

describe("MobX", () => {
  it("You can use regular assignment to replace observables on class fields", () => {
    const store = new TestStore();

    autorun(() => {
      console.log(store.someArray.length, store.someArray);
    });

    store.add("one");
    store.add("two");
    store.add("three");

    store.replace(["five", "six"]);

    expect(store.someArray).toEqual(["five", "six"]);

    store.add("one");
    store.add("two");

    expect(store.someArray).toEqual(["five", "six", "one", "two"]);
  });
});
