- [Firestore MobX](#firestore-mobx)
  - [Features](#features)
  - [Install](#install)
  - [Usage](#usage)
  - [API](#api)
  - [Testing](#testing)

# Firestore MobX

This library was inspired by
[Firestorter](https://github.com/IjzerenHein/firestorter), but resulted a
complete rewrite aiming to focus only on those features I found essential.
Firestore-mobx has a very minimal and un-opinionated API, and as a result is
implemented with a fraction of the code (~670 vs ~1900 lines of code).

This library, using Mobx, makes it very easy to create stores containing
observable Firestore documents and collections. The stores allow you to expose
computed properties and all code using that data is updated efficiently via the
observer pattern.

In case of a React application this means that components only re-render when
their specific data dependencies change.

This library has been used in production in one of my projects for several
years now so I'm fairly confident that it is solid.

## Features

- Minimal API surface
- Written in Typescript, providing static type checks through generics
- Minimal dependencies. Mobx and the Firebase web SDK are peer dependencies.
- Compatible with Firebase v9

## Features dropped from Firestorter

Here are some key differences with Firestorter:

- There is no global context or initialization. You pass the Firestore
  references directly to the observable constructors. They could come from
  different database instances.
- No support for React Native. It might be fairly straightforward, I haven't
  looked into it.
- No runtime data validation / schema support. Generics provide only static
  typing of data.
- Document data and collection documents are returned as plain JS objects. The
  reactivity is limited to the properties of the observable containers like
  `isLoading`.
- Operations like add, update and delete are performed directly on the document
  reference. So for these operations you are essentially using the native
  Firestore API.
- No support for aggregate collections. If you want to perform a query based on
  the results of another query, you can simply wait for the first query to
  return before mutating the second query with the obtained values.
- There is only one fetch modes, "auto". Snapshot listeners are automatically
  managed based on the observed count.

## Install

`yarn add firestore-mobx mobx firebase` or `npm install firestore-mobx mobx
firebase`

## Usage

```ts
import { ObservableDocument, ObservableCollection } from "firestore-mobx";

const author = new ObservableDocument<Author>(
  firestore.doc(`authors/${authorId}`),
);

const books = new ObservableCollection<Book>(
  firestore.collection(`authors/${authorId}/books`),
  (ref) => ref.orderBy("title", "asc"),
);

/**
 * Wait for the data to become available. Alternatively you can observe the
 * author.isLoading property for asynchronous waiting.
 */
await author.ready();

if (!author.hasData) {
  console.error(`Failed to find document for author ${author.id}`);
}
/**
 * Get the data. It will be typed on the schema that you passed to the
 * constructor. The data can also be undefined, if the data was not loaded yet
 * or the document did not exist.
 */
console.log(author.data);

/**
 * You can also get the data directly from the promise resolve function.
 */
author.ready().then((data) => console.log(data));

/**
 * Switch to different collection source using a collection ref
 */
books.ref = firestore.collection(`authors/${differentAuthorId}/books`);

/**
 * Change the query of a collection by passing a new "query creator function".
 * This function is called with the current collection ref to create a new query.
 */
books.query = (ref) => ref.orderBy("publishedAt", "desc");

/**
 * Wait for the data to become available. Alternatively you can observe the
 * books.isLoading property for asynchronous waiting.
 */
await books.ready();

if (books.empty) {
  console.error(`Failed to find books for author ${author.id}`);
}

/**
 * Get the data. It will be typed on the schema that you passed to the
 * constructor, wrapped in a Document type which has properties id, data, ref.
 */
books.docs.forEach((doc) => console.log(doc.data));
```

## Example APP

@TODO. I meantime you could have a look at the Firestorter examples, since the
overall concept is the same.

## API

@TODO In the meantime have a look at the
[document](./src/__test/document.test.ts) and
[collection](./src/__test/collection.test.ts) tests.

## Testing

- `yarn install-peers`: Run this to install peer-dependencies for development.
- `yarn emulate`: Start the Firestore emulator against which the test run.
- `yarn test`: Run tests.
