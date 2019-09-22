# TODO

## Must Have

- Allow collection to switch between same sub-collections.
- Add tests

## Should Have

- Cache collection document and only fetch data for the ones that change when a
  new snapshot is arriving.
- Add global setOptions function

## Could Have

- Create a base class ObservableThing and use that as basis for Document and
  Collection
- Collection.add() is misleading maybe, because the added document might not
  fall under the query and is therefor added to firestore but does not become
  part of the observable collection.
