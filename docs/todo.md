# TODO version 1.0

## Bugs

- Is there a clash between observable collections when different queries are
  used on the same collection?

## Must Have

- Allow collection to switch between same sub-collections.
- Add tests

## Should Have

- Add global setOptions function

## Could Have

- Create a base class ObservableThing and use that as basis for Document and
  Collection
- Figure out why using `this.isLoadingObservable;` (without `.get()`) breaks
  updates in autorun function.
- Collection.add() is misleading maybe, because the added document might not
  fall under the query and is therefor added to firestore but does not become
  part of the observable collection.
