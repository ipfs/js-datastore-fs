# js-datastore-fs <!-- omit in toc -->

[![](https://img.shields.io/badge/made%20by-Protocol%20Labs-blue.svg?style=flat-square)](http://ipn.io)
[![](https://img.shields.io/badge/project-IPFS-blue.svg?style=flat-square)](http://ipfs.io/)
[![](https://img.shields.io/badge/freenode-%23ipfs-blue.svg?style=flat-square)](http://webchat.freenode.net/?channels=%23ipfs)
[![standard-readme compliant](https://img.shields.io/badge/standard--readme-OK-green.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)
[![Build Status](https://github.com/ipfs/js-datastore-fs/actions/workflows/js-test-and-release.yml/badge.svg?branch=master)](https://github.com/ipfs/js-datastore-fs/actions/workflows/js-test-and-release.yml)
[![Codecov](https://codecov.io/gh/ipfs/js-datastore-fs/branch/master/graph/badge.svg)](https://codecov.io/gh/ipfs/js-datastore-fs)
[![Dependency Status](https://david-dm.org/ipfs/js-datastore-fs.svg?style=flat-square)](https://david-dm.org/ipfs/js-datastore-fs)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/feross/standard)
![](https://img.shields.io/badge/npm-%3E%3D3.0.0-orange.svg?style=flat-square)
![](https://img.shields.io/badge/Node.js-%3E%3D8.0.0-orange.svg?style=flat-square)

> Datastore implementation with file system backend.

## Table of Contents <!-- omit in toc -->

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
import { FSDatastore } from 'datastore-fs'

const store = new FSDatastore('path/to/store')
```

## Contribute

Feel free to join in. All welcome. Open an [issue](https://github.com/ipfs/js-datastore-fs/issues)!

This repository falls under the IPFS [Code of Conduct](https://github.com/ipfs/community/blob/master/code-of-conduct.md).

[![](https://cdn.rawgit.com/jbenet/contribute-ipfs-gif/master/img/contribute.gif)](https://github.com/ipfs/community/blob/master/CONTRIBUTING.md)

## License

[MIT](LICENSE)
