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

const author = createObservableDocument<Author>(
  doc(firestore, "authors", authorId),
);

// Wait for the data to load
await author.ready();

// Access the typed data
console.log(author.data); // Author | undefined
```

### Observable Collection

```ts
import { createObservableCollection } from "firestore-mobx";
import { collection, orderBy, query } from "firebase/firestore";

type Book = {
  title: string;
  publishedAt: Date;
};

const books = createObservableCollection<Book>(
  collection(firestore, "authors", authorId, "books"),
  (ref) => query(ref, orderBy("title", "asc")),
);

await books.ready();

books.documents.forEach((doc) => {
  console.log(doc.id, doc.data);
});
```

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
