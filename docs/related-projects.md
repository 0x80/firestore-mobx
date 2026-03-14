# Related Projects

## Typed Firestore

[Typed Firestore](https://typed-firestore.codecompose.dev) provides a type-safe layer on top of the Firestore SDK. It lets you define your database schema once and get full type inference for all document and collection references.

Firestore MobX works well with Typed Firestore. The `createObservableDocument` and `createObservableCollection` factory functions automatically infer the data type from typed references, so you don't need to specify generics manually:

```ts
import { createObservableDocument, createObservableCollection } from "firestore-mobx";

// Types are inferred from the typed refs
const author = createObservableDocument(refs.authors.doc(authorId));
const books = createObservableCollection(refs.authors.doc(authorId).collection("books"));
```

## Firestorter

This library was inspired by [Firestorter](https://github.com/IjzerenHein/firestorter), but is a complete rewrite focused on a minimal API. Key differences:

- No global context or initialization — you pass Firestore references directly to the constructors
- Document data and collection documents are returned as plain JS objects
- Operations like add, update, and delete use the native Firestore API directly
- Only one fetch mode ("auto") with automatic snapshot listener management
- Implemented in a fraction of the code (~670 vs ~1900 lines)
