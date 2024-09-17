# obsidian-dataedit

A wrapper for the incredible [Dataview](https://github.com/blacksmithgu/obsidian-dataview) that makes tables editable in place.

This is a remake of my [original Dataedit](https://github.com/unxok/dataedit) except built with [ViteJs](https://vitejs.dev) for better bundling, and [SolidJs](https://solidjs.com) for more performance and better rendering predictability.

_At some point I'll merge this repo into my previous one and delete this one._

## Showcase

Here's a demo as of 2024-08-02
![showcase gif](/gifs/showcase.gif)

## Datacore...?

I think of this project as a middle ground between Dataview and [Datacore](https://github.com/blacksmithgu/datacore), which is the successor to Dataview made by the same creator (blacksmithgu)

> "Work-in-progress successor to Dataview with a focus on UX and speed."

Datacore recently has had much more work being done on it by its contributers and it is now open to contributions. Once I get this plugin to a good place, I am hoping to try and help out over there!

I still want to put my plugin out there as a drop-in replacement Dataview until Datacore is ready, as well as to just have the features I want and getting more practice in development.

## Roadmap

### Query processing

- [x] Parse for true property names and create alias object for use when updating properties
- [x] If `WITHOUT ID` is used and no `file.link` is included, add it to the query and hide the `file.link` column
- [x] Find `file.link` column index
- [x] Read dataview settings and use as needed
  - [x] date/datetime format
  - [x] null value display
  - [x] ID column display
- [ ] dataeditjs (dataviewjs subset)
  - [ ] provide `dv` object
  - [ ] override `dv.table()` and `dv.markdownTable()`
    - [ ] pass headers and data to `dataviewAPI.query()`
    - [ ] Add third param for alias array
    - [ ] Look into getting rendering methods like `dv.el()` and `dv.paragraph()` to work right

### Editable table cells by value type

Each 'type' will change what type of input and how values are updated in frontmatter.

- [x] text
- [x] list
- [x] number
- [x] checkbox
- [x] date
- [x] datetime
- [x] inline\*
  - [x] These can behave like any normal 'type' but their updating process is different
- [x] nested\*
  - [x] These can behave like any normal 'type' but their updating process is different

### Configuration

- [x] column reordering
- [x] custom class names for table
- [x] lock editing
- [x] property type icons
- [x] default template for add row button
- [x] default folder for add row button
- [x] custom options for column
- [ ] column options
  - [x] ~~alignment~~
    - Due to the dynamic nature of the column order, I don't think I'll do this
    - It can also be achieved with CSS snippets if the user really wants
  - [x] set/change alias
  - [x] set/change property type
  - [x] rename property
  - [x] remove column
- [x] alignment
- [x] pagination
  - [x] page size
  - [x] current page
  - [x] page navigation
    - [x] first
    - [x] previous
    - [x] ~~next~~ decided it clutters more than it's worth
    - [x] ~~last~~ decided it clutters more than it's worth
    - [x] input page number
