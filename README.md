- [Firestore MobX](#firestore-mobx)
  - [Features](#features)
  - [Install](#install)
  - [Usage](#usage)
  - [API](#api)
  - [Testing](#testing)

# Firestore MobX

This library was inspired by
[Firestorter](https://github.com/IjzerenHein/firestorter). Read the [migration
docs](/docs/migrate-from-firestorter.md) if you are interested in the motivation
and differences.

You should be able to use this in any Javascript application including React and
Node.js. This library has not yet been tested in the context of React Native.

## Features

- Minimal API surface
- Written in Typescript, providing static type checks through generics
- Minimal dependencies

## Install

`yarn add firestore-mobx` or `npm install firestore-mobx`

## Usage

```ts
import { ObservableDocument, ObservableCollection } from "firestore-mobx";

const author = new ObservableDocument<Author>(
  firestore.doc(`authors/${authorId}`)
);

const books = new ObservableCollection<Book>(
  firestore.collection(`authors/${authorId}/books`),
  ref => ref.orderBy("title", "asc")
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
author.ready().then(data => console.log(data));

/**
 * Switch to different collection source using a collection ref
 */
books.ref = firestore.collection(`authors/${differentAuthorId}/books`);

/**
 * Change the query of a collection by passing a new "query creator function".
 * This function is called with the current collection ref to create a new query.
 */
books.query = ref => ref.orderBy("publishedAt", "desc");

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
books.docs.forEach(doc => console.log(doc.data));
```

## API

See the [API docs](/docs/api.md).

## Testing

- `yarn install-peers`: Run this to install peer-dependencies for development.
- `yarn emulate`: Start the Firestore emulator against which the test run.
- `yarn test`: Run tests.
