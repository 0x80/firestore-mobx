# Observable Document

`ObservableDocument` wraps a single Firestore document with MobX observability. It automatically manages snapshot listeners and exposes reactive properties.

## Constructor

```ts
new ObservableDocument<T>(source?: DocumentReference | CollectionReference, options?: Options)
```

The `source` parameter accepts either a `DocumentReference` (for a specific document) or a `CollectionReference` (when the document ID is not yet known). If a `CollectionReference` is passed, use `attachTo()` to set the document ID later.

When the reference is typed (e.g. `DocumentReference<Author>`), the generic `T` is inferred automatically — you don't need to specify it.

### Options

| Option  | Type      | Default | Description                                                                      |
| ------- | --------- | ------- | -------------------------------------------------------------------------------- |
| `debug` | `boolean` | `false` | Enable debug logging to the console.                                             |
| `lazy`  | `boolean` | `false` | Defer loading until the document is observed. See [Lazy Loading](/lazy-loading). |

## Properties

| Property    | Type                  | Description                                                   |
| ----------- | --------------------- | ------------------------------------------------------------- |
| `data`      | `T \| undefined`      | The document data, or `undefined` if not loaded or not found. |
| `document`  | `Document<T>`         | Object with `id`, `data`, and `ref`. Throws if not available. |
| `id`        | `string`              | The document ID, or `"__no_id"` if no reference is set.       |
| `isLoading` | `boolean`             | Whether the document is currently loading.                    |
| `path`      | `string \| undefined` | The full Firestore path of the document.                      |

## Methods

### `ready()`

Returns a `Promise<T | undefined>` that resolves when the document data is first available. If no snapshot listener is active, it performs a one-time fetch.

```ts
const data = await author.ready();
```

### `attachTo(documentId?: string)`

Switch the document to a different ID within the same collection. Pass `undefined` to detach and clear the data. Returns `this` for chaining.

This is useful when the document ID depends on runtime state, such as user interaction or data from another document:

```ts
class AuthorStore {
  // Pass the collection ref — type Author is inferred from refs.authors
  private _author = createObservableDocument(refs.authors);

  loadAuthor(authorId: string) {
    this._author.attachTo(authorId);
  }

  clearAuthor() {
    this._author.attachTo(undefined);
  }

  get author() {
    return this._author.data;
  }
}
```

You can chain `attachTo` with `ready()` when you need to wait for the data:

```ts
const data = await this._author.attachTo(authorId).ready();
```

### `onError(callback)`

Register an error handler. Without this, errors are thrown. Returns `this` for chaining.

```ts
author.onError((err) => Sentry.captureException(err));
```

### `onData(callback)`

Register a callback that fires whenever new data arrives from Firestore. Returns `this` for chaining.

This is the primary mechanism for cascading data loads, where one document's data determines what other documents to load:

```ts
// Types are inferred from refs — no generics needed
this._book = createObservableDocument(refs.books);
this._author = createObservableDocument(refs.authors);

this._book.attachTo(bookId);

// data is typed as Book, so data.author_id is checked at compile time
this._book.onData((data) => {
  this._author.attachTo(data.author_id);
});
```

::: tip
The `onData` callback fires before the loading state is updated. This ensures dependent observables can begin loading before any component sees `isLoading: false` on the parent, preventing flicker in combined loading states like `this._book.isLoading || this._author.isLoading`.
:::

## Factory Function

The `createObservableDocument` factory function infers the generic type `T` from the reference you pass in. This means that when your references carry type information, you never need to specify generics manually:

```ts
import { createObservableDocument } from "firestore-mobx";

// ref is DocumentReference<Author> → result is ObservableDocument<Author>
const author = createObservableDocument(refs.authors);

// ref is CollectionReference<Book> → result is ObservableDocument<Book>
const book = createObservableDocument(refs.books);
```

See [Typed Refs](/getting-started#typed-refs) for how to set up your references, or use [Typed Firestore](https://typed-firestore.codecompose.dev) for a more comprehensive approach.
