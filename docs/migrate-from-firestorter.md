# Migrate from Firestorter

## Origin

This library was inspired by
[Firestorter](https://github.com/IjzerenHein/firestorter).

After finding myself using only a small portion of the Firestorter API and at
the same time missing some elements, I decided to take it as a challenge to
develop a lean alternative based on the same core idea.

I have tried to focus on the bare essentials and managed to discard a lot of the
complexity and code. To give you an idea, at the time of writing firestore-mobx
is implemented in less then one-third of the code.

In my quest to keep the codebase simple I have discarded some use-cases for the
original Firestorter APIs, so this library will not be valid alternative for
everyone.

## What was Removed / Changed

Below is a summary of the most important features from Firestorter that were
removed or implemented differently.

### Real-time update modes

The "manual" and "on" updates modes are gone. The only mode is "auto", so
snapshot listeners are registered when the subject becomes observed.

### Run-time schema checks

The optional Firestorter run-time schema type checks were removed in favor of
compile-time checks using Typescript generics.

Since data sources are dynamic (refs can change after object construction) you
will need to be cautious that you do not trick the compiler into thinking your
type is something it is not. For example if you create an observable collection
for books and pass type `Book` to the constructor, nothing will prevent you from
later switching that ref to a completely different collection. Your compiler
will still expect it to be dealing with type `Book`.

I have considered making the refs fixed for collections, but this can't work for
subcollection. In these cases you need to be able to switch the collection ref
dynamically. In such case the type of document remains the same, but the ref is
still completely different.

### Context and Initialization

There is no (global) context and initialization. You create documents and
collections by passing in a Firestore reference to the constructor. Those
references could well be from different Firestore instances. Setting a source
via string paths is therefor not allowed.

### Observable Documents as part of Collections

In firestorter a collection class generates document class instances for each
document in the query snapshot. It needs to keep track of these instances and
this adds some complexity.

In firestore-mobx the `collection.docs` property is an array of plain objects.
If you would like to pass on any of the collection items as an observable
document you can simply pass its data into the `ObservableDocument` constructor.

The removal of this complexity comes with a small run-time overhead, because the
document will re-fetch its data after being initialized as a new observable
document instance. I feel yet undecided if this is worth cutting away that
complexity, so I might add this later.

### Reactive Paths

> Reactive paths are functions that depend on Documents (or other observables)
> and return a path. This makes it very easy to change the path of a Collection
> or Document, based on the path or even data of another Document.

I never had a need for reactive paths so I left this out. If you disagree please
let me know so I can reconsider them.

### Reactive Query Functions

> When the Query Function accesses an observable, it will automatically be
> re-evaluated whenever that observable changes.

I never had a need for reactive query functions so I left this out. If you
disagree please let me know so I can reconsider them.

### Other Features

Newer versions of Firestorter contain even more functionality. I will not cover
them now, so check it out for yourself. These include:

- Aggregate Collections
- Geo Queries
