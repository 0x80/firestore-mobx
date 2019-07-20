# TODO version 1.0

## Must Have

- Figure out what to do with refs of sub-collections. Possibly remove restrictions.
- Limit document ref changes to same collection, otherwise T doesn't make any
  sense anymore.
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
