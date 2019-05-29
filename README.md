# js-datastore-fs

[![](https://img.shields.io/badge/made%20by-Protocol%20Labs-blue.svg?style=flat-square)](http://ipn.io)
[![](https://img.shields.io/badge/project-IPFS-blue.svg?style=flat-square)](http://ipfs.io/)
[![](https://img.shields.io/badge/freenode-%23ipfs-blue.svg?style=flat-square)](http://webchat.freenode.net/?channels=%23ipfs)
[![standard-readme compliant](https://img.shields.io/badge/standard--readme-OK-green.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)
[![Build Status](https://flat.badgen.net/travis/ipfs/js-datastore-fs)](https://travis-ci.com/ipfs/js-datastore-fs)
[![Codecov](https://codecov.io/gh/ipfs/js-datastore-fs/branch/master/graph/badge.svg)](https://codecov.io/gh/ipfs/js-datastore-fs)
[![Dependency Status](https://david-dm.org/ipfs/js-datastore-fs.svg?style=flat-square)](https://david-dm.org/ipfs/js-datastore-fs)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/feross/standard)
![](https://img.shields.io/badge/npm-%3E%3D3.0.0-orange.svg?style=flat-square)
![](https://img.shields.io/badge/Node.js-%3E%3D8.0.0-orange.svg?style=flat-square)

> Datastore implementation with file system backend.

## Lead Maintainer

[Alex Potsides](https://github.com/achingbrain)

## Table of Contents

- [js-datastore-fs](#js-datastore-fs)
  - [Lead Maintainer](#lead-maintainer)
  - [Table of Contents](#table-of-contents)
  - [Install](#install)
  - [Usage](#usage)
  - [Contribute](#contribute)
  - [License](#license)

## Install

```
$ npm install datastore-fs
```

## Usage

```js
const FsStore = require('datastore-fs')
const store = new FsStore('path/to/store')
```

## Contribute

Feel free to join in. All welcome. Open an [issue](https://github.com/ipfs/js-datastore-fs/issues)!

This repository falls under the IPFS [Code of Conduct](https://github.com/ipfs/community/blob/master/code-of-conduct.md).

[![](https://cdn.rawgit.com/jbenet/contribute-ipfs-gif/master/img/contribute.gif)](https://github.com/ipfs/community/blob/master/contributing.md)

## License

[MIT](LICENSE)
