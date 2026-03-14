# Getting Started

## Prerequisites

- [Firebase](https://firebase.google.com/) v10 or later (modular SDK)
- [MobX](https://mobx.js.org/) v6 or later

## Installation

```sh
pnpm add firestore-mobx mobx firebase
```

Or with your preferred package manager:

```sh
npm install firestore-mobx mobx firebase
yarn add firestore-mobx mobx firebase
```

## Basic Usage

### Observable Document

```ts
import { createObservableDocument } from "firestore-mobx";
import { doc } from "firebase/firestore";

type Author = {
  name: string;
  email: string;
};

const authorRef = doc(
  firestore,
  "authors",
  authorId,
) as DocumentReference<Author>;

const author = createObservableDocument(authorRef);

// Wait for the data to load
await author.ready();

// Access the typed data — inferred as Author | undefined
console.log(author.data);
```

### Observable Collection

```ts
import { createObservableCollection } from "firestore-mobx";
import { collection, orderBy, query } from "firebase/firestore";

type Book = {
  title: string;
  publishedAt: Date;
};

const booksRef = collection(
  firestore,
  "authors",
  authorId,
  "books",
) as CollectionReference<Book>;

const books = createObservableCollection(booksRef, (ref) =>
  query(ref, orderBy("title", "asc")),
);

await books.ready();

// Each doc is typed as Document<Book> with { id, data, ref }
books.documents.forEach((doc) => {
  console.log(doc.id, doc.data.title);
});
```

### Typed Refs

In the examples above, we cast each reference inline, but in practice you define your typed references once in a central place. This way the types flow through automatically:

```ts
// refs.ts
import { collection, doc } from "firebase/firestore";

export const refs = {
  authors: collection(firestore, "authors") as CollectionReference<Author>,
  books: (authorId: string) =>
    collection(
      firestore,
      "authors",
      authorId,
      "books",
    ) as CollectionReference<Book>,
};
```

Now the factory functions infer the data type from the ref — no manual generics needed:

```ts
import {
  createObservableDocument,
  createObservableCollection,
} from "firestore-mobx";
import { refs } from "./refs";

// Type is inferred as ObservableDocument<Author>
const author = createObservableDocument(doc(refs.authors, authorId));

// Type is inferred as ObservableCollection<Book>
const books = createObservableCollection(refs.books(authorId));
```

For a more comprehensive approach to typed refs, see [Typed Firestore](https://typed-firestore.codecompose.dev).

### Using with React

When combined with [mobx-react-lite](https://github.com/mobxjs/mobx/tree/main/packages/mobx-react-lite), your React components automatically re-render when Firestore data changes:

```tsx
import { observer } from "mobx-react-lite";

const AuthorProfile = observer(() => {
  const { appStore } = useStores();

  if (appStore.isLoading) return <div>Loading...</div>;

  const author = appStore.author;
  if (!author) return <div>Not found</div>;

  return <h1>{author.name}</h1>;
});
```

## How It Works

Firestore MobX uses MobX's `onBecomeObserved` and `onBecomeUnobserved` to automatically manage Firestore snapshot listeners. By default, listeners are active in the background, keeping data up-to-date. If you prefer to only load data when it is actively observed, enable [lazy loading](/lazy-loading).

Writes, updates, and deletes are performed directly on Firestore document references using the native Firebase SDK. This library only handles the reactive read side.
