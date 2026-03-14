# Building Stores

The recommended way to use Firestore MobX is inside MobX stores. This page shows common patterns found in production codebases.

## Basic Store

A typical store creates observables in the constructor and exposes data through computed getters:

```ts
import { makeAutoObservable } from "mobx";
import { createObservableDocument, createObservableCollection } from "firestore-mobx";
import { collection, doc } from "firebase/firestore";

class AuthorStore {
  private _author = createObservableDocument<Author>(
    doc(firestore, "authors", authorId),
  );

  private _books = createObservableCollection<Book>(
    collection(firestore, "authors", authorId, "books"),
  );

  constructor() {
    makeAutoObservable(this);
  }

  get isLoading() {
    return this._author.isLoading || this._books.isLoading;
  }

  get author() {
    return this._author.data;
  }

  get books() {
    return this._books.documents;
  }
}
```

Components that access `store.author` or `store.books` through an `observer()` wrapper will automatically re-render when the Firestore data changes.

## Cascading Data Loads

Often one document's data determines which other documents or sub-collections to load. Use `onData` to set up these reactive chains:

```ts
class BookStore {
  private _book = createObservableDocument<Book>(refs.books);
  private _author = createObservableDocument<Author>(refs.authors);
  private _chapters = createObservableCollection<Chapter>(undefined);
  private _series = createObservableDocument<Series>(refs.series);

  constructor(bookId: string) {
    makeAutoObservable(this);

    this._book.attachTo(bookId);

    this._book.onData((data) => {
      // Load the author that wrote this book
      this._author.attachTo(data.author_id);

      // Load the sub-collection of chapters
      this._chapters.attachTo(refs.bookChapters(bookId));

      // Conditionally load the series this book belongs to
      if (data.series_id) {
        this._series.attachTo(data.series_id);
      } else {
        this._series.attachTo(undefined);
      }
    });
  }

  get isLoading() {
    return this._book.isLoading || this._author.isLoading;
  }

  get author() {
    return this._author.data;
  }

  get chapters() {
    return this._chapters.documents;
  }
}
```

## Waiting for Initial Data

Use `ready()` when you need to perform actions after data is first available, such as initializing form state:

```ts
class BookEditStore {
  private _book = createObservableDocument<Book>(refs.books);

  editedTitle = "";
  editedChapters: Chapter[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  loadBook(bookId: string) {
    this._book
      .attachTo(bookId)
      .ready()
      .then((book) => {
        if (!book) return;

        runInAction(() => {
          this.editedTitle = book.title;
          this.editedChapters = book.chapters;
        });
      })
      .catch((err) => console.error(err));
  }
}
```

## Combining Loading States

A combined `isLoading` getter across multiple observables gives components a single property to check:

```ts
get isLoading() {
  return (
    this._author.isLoading ||
    this._books.isLoading ||
    this._publisher.isLoading
  );
}
```

## Error Handling

For document access that might fail, wrap it in a try-catch rather than letting MobX propagate the error:

```ts
get authorName(): string {
  try {
    return this._author.document.data.name;
  } catch (err) {
    Sentry.captureException(err);
    return "Unknown";
  }
}
```

For observable-level error handling, use the `onError` callback:

```ts
this._book.onError((err) => {
  Sentry.captureException(err);
});
```

## Deferred Sub-Collections

When a collection depends on a parent that isn't known at construction time, pass `undefined` as the ref and attach later:

```ts
class AuthorStore {
  private _otherBooks = createObservableCollection<Book>(undefined);

  constructor() {
    makeAutoObservable(this);
  }

  loadOtherBooksByAuthor(authorId: string) {
    this._otherBooks.attachTo(
      collection(firestore, "authors", authorId, "books"),
    );
  }

  clearOtherBooks() {
    this._otherBooks.attachTo(undefined);
  }

  get otherBooks() {
    return this._otherBooks.documents;
  }
}
```
