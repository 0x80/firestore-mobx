# Related Projects

## Typed Firestore

[Typed Firestore](https://typed-firestore.codecompose.dev) provides a type-safe layer on top of the Firestore SDK. It lets you define your database schema once and get full type inference for all document and collection references.

Firestore MobX pairs well with Typed Firestore. Since `createObservableDocument` and `createObservableCollection` infer their generic type from the reference, typed refs eliminate the need to specify generics manually:

```ts
import {
  createObservableDocument,
  createObservableCollection,
} from "firestore-mobx";

// Without typed refs — you must specify the generic yourself
const author = createObservableDocument<Author>(
  doc(firestore, "authors", authorId),
);

// With typed refs — the type is inferred from the ref
const author = createObservableDocument(refs.authors.doc(authorId));
const books = createObservableCollection(refs.books(authorId));
```

This pattern scales well in larger codebases: you define your types once in the refs, and every observable that uses them is automatically typed.

## Firestorter

This library was inspired by [Firestorter](https://github.com/IjzerenHein/firestorter), but is a complete rewrite focused on a minimal API. Key differences:

- No global context or initialization — you pass Firestore references directly to the constructors
- Document data and collection documents are returned as plain JS objects
- Operations like add, update, and delete use the native Firestore API directly
- Only one fetch mode ("auto") with automatic snapshot listener management
- Implemented in a fraction of the code (~670 vs ~1900 lines)
