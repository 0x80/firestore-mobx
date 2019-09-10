- [Firestore MobX](#Firestore-MobX)
  - [Features](#Features)
  - [Install](#Install)
  - [Usage](#Usage)
  - [Restrictions on Dynamic Data
    Sourcing](#Restrictions-on-Dynamic-Data-Sourcing)
    - [Document](#Document)
    - [Collection](#Collection)
  - [API](#API)

# Firestore MobX

**WARNING** This library is very new. There might still be some fundamental
issues. Until the 1.0 release do not expect this to be suitable for production.

This library was inspired by
[Firestorter](https://github.com/IjzerenHein/firestorter). Read the [migration
docs](/docs/migrate-from-firestorter.md) if you are interested in the motivation
and differences.

You should be able to use this in any Javascript application including React,
React-Native and Node.js.

**NOTE** This library is based on my personal experience using Firestorter. If
there are any features that you miss and deem essential, please let me know. It
is possible that I have overlooked some valid use-cases.

## Features

- A minimal and un-opinionated API surface
- Written in Typescript with strict typings
- Minimal dependencies (only Firebase and MobX really)

## Install

`yarn add firestore-mobx` or `npm install firestore-mobx`

## Usage

## Restrictions on Dynamic Data Sourcing

Observable documents and collections are flexible because they can change their
data source and query dynamically at any time. In order to reduce complexity and
offer strong typing some restrictions are enforced.

### Document

1. An observable document always links to the Firestore collection passed into
   the constructor. A document can change its id after it was created, switching
   to a different document in Firestore, but the collection reference will never
   change. With Typescript we get compile-time type checks based on the schema
   you use to declare the instance with. If the source would be allowed to
   switch to a different collection this type would have no practical meaning.

   If you need to observe documents from different collections simply create
   multiple ObservableDocument instances.

### Collection

1. An observable collection always links to the Firestore collection passed into
   the constructor. The query can be changed after the object was created,
   influencing the number of documents in the collection, but it can not switch
   to a different collection dynamically. The motivation for this is the same as
   restriction 1 on observable documents.

   A slight exception to this are sub-collections; You are allowed to switch the
   collection reference of `authors/{authorId}/books` to a different `authorId`
   dynamically, since both sub-collections would still reference the same type
   of documents.

2. A collection without a query produces no documents. The alternative would be
   to fetch all documents, but this is not typically something you would want to
   do in a client-side application. By placing this restriction on collections
   it not only simplifies the internal logic but we avoid fetching a large
   collection by accident.

   If you have a relatively small collection, like an author's books, and you
   want to fetch all of it, you can simply pass in a Firestore query that would
   include all documents. For example `.orderBy("publishedAt", "desc")` or
   `.limit(999)`. You most likely want to apply some sort of ordering anyway.

## API

See the [API docs](/docs/api.md).
