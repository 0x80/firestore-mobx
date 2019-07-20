# Migrate from Firestorter

## Origin

This library was inspired by
[Firestorter](https://github.com/IjzerenHein/firestorter). Many thanks to [Hein
Rutjes](https://github.com/IjzerenHein) for creating that library and
introducing me to the concepts.

After finding myself using only a small portion of the Firestorter API and
missing strict Typescript typings, I decided to create a leaner more focussed
alternative based on the same core idea.

By questioning every feature and only implementing the bare essentials I was
able to discard a lot of the complexity and code. To give you an idea,
firestore-mobx is implemented in less then one-third of the code; 362 vs 1267
lines.

## What was Removed / Changed

Below is a summary of the most important features from Firestorter that were
removed or implemented differently.

### Real-time update modes

The "manual" and "on" updates modes are gone. The only mode is "auto", removing
the need for active reference counting.

### Run-time schema checks

The optional Firestorter run-time schema type checks were removed in favor of
strong compile-time checks. These checks were made possible by placing some
[restrictions](/README.md#Restrictions-on-Dynamic-Data-Sourcing) on the way you
use collections and documents.

### Context and Initialization

There is no (global) context and initialization. You create documents and
collections by passing in a Firestore reference to the constructor. Those
references could be from different Firestore instances. Setting a source via
string paths is therefor not allowed.

### Observable Documents as part of Collections

In firestorter a collection class generates document class instances for each
document in the query snapshot. It needs to keep track of these instances and
this results in a lot of complexity and overhead.

In firestore-mobx the `collection.docs` property is an array of plain objects.
If you would like to pass on any of the collection items as an observable
document you can simply pass its data into the `ObservableDocument` constructor.
This will instantly give you a document without making an extra round-trip to
the database. I think this API gives maximum control and flexibility, because
you decide when you need this and there is no additional overhead.

### Reactive Paths

> Reactive paths are functions that depend on Documents (or other observables)
> and return a path. This makes it very easy to change the path of a Collection
> or Document, based on the path or even data of another Document.

I have needed them and doubt they are essential, but if you disagree please let
me know why.

### Reactive Query Functions

> When the Query Function accesses an observable, it will automatically be
> re-evaluated whenever that observable changes.

I have needed them and doubt they are essential, but if you disagree please let
me know why.
