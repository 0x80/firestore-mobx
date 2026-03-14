# Observable Collection

`ObservableCollection` wraps a Firestore collection (or query) with MobX observability. It automatically manages snapshot listeners and exposes a reactive list of documents.

## Constructor

```ts
new ObservableCollection<T>(
  ref?: CollectionReference<T>,
  queryCreatorFn?: (ref: CollectionReference) => Query,
  options?: Options,
)
```

The `ref` parameter is optional because for sub-collections you might not know the full path in advance. Use `attachTo()` to set the reference later.

The `queryCreatorFn` receives the collection reference and should return a Firestore `Query`. It is re-applied automatically when the collection reference changes via `attachTo()`.

When the reference is typed (e.g. `CollectionReference<Book>`), the generic `T` is inferred automatically — you don't need to specify it.

### Options

| Option                  | Type      | Default | Description                                                                        |
| ----------------------- | --------- | ------- | ---------------------------------------------------------------------------------- |
| `debug`                 | `boolean` | `false` | Enable debug logging to the console.                                               |
| `lazy`                  | `boolean` | `false` | Defer loading until the collection is observed. See [Lazy Loading](/lazy-loading). |
| `ignoreInitialSnapshot` | `boolean` | `false` | Skip the first snapshot from the listener.                                         |

## Properties

| Property       | Type                  | Description                                            |
| -------------- | --------------------- | ------------------------------------------------------ |
| `documents`    | `Document<T>[]`       | Array of documents, each with `id`, `data`, and `ref`. |
| `isEmpty`      | `boolean`             | Whether the collection has no documents.               |
| `hasDocuments` | `boolean`             | Whether the collection has at least one document.      |
| `isLoading`    | `boolean`             | Whether the collection is currently loading.           |
| `path`         | `string \| undefined` | The Firestore path of the collection.                  |
| `ref`          | `CollectionReference` | The collection reference. Throws if not set.           |

## Methods

### `ready()`

Returns a `Promise<Document<T>[]>` that resolves when documents are first available. If no snapshot listener is active, it performs a one-time fetch.

```ts
const docs = await books.ready();
```

### `attachTo(ref?: CollectionReference<T>)`

Switch to a different collection reference. Pass `undefined` to detach and clear the documents. Returns `this` for chaining.

This is commonly used for sub-collections where the path depends on a parent document:

```ts
class AuthorStore {
  // No ref yet — type is inferred when attachTo is called with a typed ref
  private _books = createObservableCollection<Book>(undefined);

  loadAuthor(authorId: string) {
    this._books.attachTo(refs.books(authorId));
  }

  get books() {
    return this._books.documents;
  }
}
```

If a `queryCreatorFn` was provided in the constructor, it is automatically re-applied to the new reference.

### `query` (setter)

Change the query of the collection. If the new query is equivalent to the current one (checked via `queryEqual`), it's a no-op. Pass `undefined` to clear the query and use the raw collection reference.

```ts
books.query = (ref) => query(ref, orderBy("publishedAt", "desc"));
```

### `onError`

Set an error handler function. Without this, errors are thrown.

```ts
books.onError = (err) => console.error(err);
```

## Factory Function

The `createObservableCollection` factory function infers the generic type `T` from the reference you pass in. This means that when your references carry type information, you never need to specify generics manually:

```ts
import { createObservableCollection } from "firestore-mobx";

// ref is CollectionReference<Book> → result is ObservableCollection<Book>
const books = createObservableCollection(refs.books(authorId));

// ref is CollectionReference<Author> → result is ObservableCollection<Author>
const authors = createObservableCollection(refs.authors);
```

See [Typed Refs](/getting-started#typed-refs) for how to set up your references, or use [Typed Firestore](https://typed-firestore.codecompose.dev) for a more comprehensive approach.
