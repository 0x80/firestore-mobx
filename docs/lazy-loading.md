# Lazy Loading

By default, both `ObservableDocument` and `ObservableCollection` start loading data immediately and keep their snapshot listeners active in the background, even when no MobX observer is watching. This means data is always up-to-date.

## Enabling Lazy Mode

Pass `lazy: true` in the options to defer loading until the observable is actively observed by MobX:

```ts
const author = new ObservableDocument<Author>(authorRef, { lazy: true });
const books = new ObservableCollection<Book>(booksRef, undefined, {
  lazy: true,
});
```

## Behavior Differences

| Behavior                     | Default (`lazy: false`)     | Lazy (`lazy: true`)          |
| ---------------------------- | --------------------------- | ---------------------------- |
| Listener setup               | Immediately on construction | When first observed          |
| Listener teardown            | Never (stays active)        | When no longer observed      |
| Data freshness when observed | Always current              | Fetches on first observation |

## When to Use Lazy Loading

Lazy loading is useful when:

- You create many observables upfront but only display some of them at a time
- You want to minimize Firestore reads for data that may never be displayed
- You are building paginated views where off-screen data doesn't need real-time updates

For most cases, the default behavior (eager loading) provides the best user experience since data is always ready when the UI needs it.
