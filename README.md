- [Firestore MobX](#Firestore-MobX)
  - [Features](#Features)
  - [Install](#Install)
  - [Usage](#Usage)
  - [Restrictions on Dynamic Data Sourcing](#Restrictions-on-Dynamic-Data-Sourcing)
    - [Document](#Document)
    - [Collection](#Collection)

# Firestore MobX

This library was inspired by Firestorter. Read the [migration docs](/docs/migration) if you are
interested in the motivation and differences.

You should be able to use this in any Javascript application including
React, React-Native and Node.js.

**DISCLAIMER** This library is still very new and based on my personal
experience using Firestorter. If there are any features that you miss and deem
essential, please let me know. It is well possible that I have overlooked some
use-cases.

## Features

- A flexible and un-opinionated API surface
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

1. An observable document can change its ref after it was created, but the new
   ref needs to be from the same collection. This is required because with
   Typescript we get compile-time type checks based on what you pass into the
   constructor. If the ref would be allowed to switch to a different collection,
   this type would have no practical meaning. Also I have to yet encounter a
   situation that requires this in a real-life application.

### Collection

1. An observable collection always links to the Firestore collection passed into
   the constructor. The query can be changed after the object was created,
   influencing the number of documents in the collection, but it can not switch
   to a different collection dynamically. The motivation for this is similar to
   restriction 1 on observable documents.

2. A collection without a query produces no documents. Retrieving all documents
   from a collection is not typically something you would do in a client-side
   application. By placing this restriction on collections it not only
   simplifies the logic but we avoid fetching a large collection by accident. If
   you have a relatively small collection and you do want to fetch all of it,
   you can simply pass in a Firestore query that would include everything, for
   example `.orderBy("updatedAt", "desc")`, `.limit(999)` or `.after("0")`
