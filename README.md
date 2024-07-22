# obsidian-dataedit

A wrapper for the incredible [Dataview](https://github.com/blacksmithgu/obsidian-dataview) that makes tables editable in place.

This is a remake of my [original Dataedit](https://github.com/unxok/dataedit) except built with [ViteJs](https://vitejs.dev) for better bundling, and [SolidJs](https://solidjs.com) for more performance and better rendering predictability.

## Datacore...?

I think of this project as a middle ground between Dataview and [Datacore](https://github.com/blacksmithgu/datacore), which is the successor to Dataview made by the same creator (blacksmithgu)

> "Work-in-progress successor to Dataview with a focus on UX and speed."

Datacore recently has had much more work being done on it by its contributers and it is now open to contributions. Once I get this plugin to a good place, I am hoping to try and help out over there!

I still want to put my plugin out there as a drop-in replacement Dataview until Datacore is ready or for those who simply aren't ready to change all their queries in their vault to a new syntax.

## Roadmap

### Query processing

- [x] Parse for true property names and create alias object for use when updating properties
- [ ] If `WITHOUT ID` is used and no `file.link` is included, add it to the query and hide the `file.link` column
- [x] Find `file.link` column index
- [ ] Read dataview settings and use as needed
  - [x] date/datetime format
  - [ ] null value display
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

#### Autocomplete

- [ ] wikilinks
- [ ] tags
- [ ] blocks (tried before and it might not be doable)
- [ ] previously used
  - [ ] text
  - [ ] list
- [ ] custom

### Configuration

- [x] column reordering
- [ ] custom class names for table
- [ ] lock editing
- [ ] alignment
  - [ ] all rows
  - [ ] all columns
  - [ ] specific row
  - [ ] specific column
- [ ] pagination
  - [ ] page size
  - [ ] current page
  - [ ] page navigation
    - [ ] first
    - [ ] previous
    - [ ] next
    - [ ] last
    - [ ] input page number
