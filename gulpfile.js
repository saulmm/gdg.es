/**
 * @license
 * Copyright (c) 2016 The GDG Spain Authors. All rights reserved.
 * This code may only be used under the MIT style license found at http://gdg.es/LICENSE.txt
 */

/* eslint-disable no-console */

'use strict';

const del = require('del');
const gulp = require('gulp');
const gulpif = require('gulp-if');
const htmlmin = require('gulp-htmlmin');
const imagemin = require('gulp-imagemin');
const jsonmin = require('gulp-jsonmin');
const mergeStream = require('merge-stream');
const polymerBuild = require('polymer-build');
const replace = require('gulp-replace');
const uglify = require('gulp-uglify');

const production = process.env.NODE_ENV === 'production';
const swPrecacheConfig = require('./sw-precache-config.js');
const polymerJson = require('./polymer.json');
const polymerProject = new polymerBuild.PolymerProject(polymerJson);
const buildDirectory = 'build';

const settings = {
  authDomain: {
    develop: 'gdg-es-develop.firebaseapp.com',
    production: 'gdg-es.firebaseapp.com'
  },
  databaseUrl: {
    develop: 'https://gdg-es-develop.firebaseio.com',
    production: 'https://gdg-es.firebaseio.com'
  }
};

/**
 * Waits for the given ReadableStream
 */
function waitFor(stream) {
  return new Promise((resolve, reject) => {
    stream.on('end', resolve);
    stream.on('error', reject);
  });
}

function build() {
  let sourcesStreamSplitter = new polymerBuild.HtmlSplitter();
  let dependenciesStreamSplitter = new polymerBuild.HtmlSplitter();

  return new Promise((resolve, reject) => { // eslint-disable-line no-unused-vars
    // Okay, so first thing we do is clear the build directory
    console.log(`Deleting ${buildDirectory} directory...`);
    del([buildDirectory])
      .then(() => {
        // Let's start by getting your source files.
        let sourcesStream = polymerProject.sources()
          .pipe(gulpif(production, replace(
            settings.authDomain.develop,
            settings.authDomain.production
          )))
          .pipe(gulpif(production, replace(
            settings.databaseUrl.develop,
            settings.databaseUrl.production
          )))
          .pipe(gulpif(/\.(png|gif|jpg|svg)$/, imagemin()))
          .pipe(sourcesStreamSplitter.split())
          .pipe(gulpif(/\.html$/, htmlmin({
            collapseWhitespace: true
          })))
          .pipe(gulpif(/\.js$/, uglify()))
          .pipe(gulpif(/\.json$/, jsonmin()))
          .pipe(sourcesStreamSplitter.rejoin());

        // Similarly, you can get your dependencies seperately and perform any
        // dependency-only optimizations here as well.
        let dependenciesStream = polymerProject.dependencies()
          .pipe(dependenciesStreamSplitter.split())
          // Add any dependency optimizations here.
          .pipe(dependenciesStreamSplitter.rejoin());

        // Okay, now let's merge them into a single build stream
        let buildStream = mergeStream(sourcesStream, dependenciesStream)
          .once('data', () => {
            console.log('Analyzing build dependencies...');
          });

        // If you want bundling, pass the stream to polymerProject.bundler.
        // This will bundle dependencies into your fragments so you can lazy
        // load them.
        buildStream = buildStream.pipe(polymerProject.bundler);

        // Okay, time to pipe to the build directory
        buildStream = buildStream.pipe(gulp.dest(buildDirectory));

        // Wait for the buildStream to complete
        return waitFor(buildStream);
      })
      .then(() => {
        console.log('Generating the Service Worker...');
        return polymerBuild.addServiceWorker({
          project: polymerProject,
          buildRoot: buildDirectory,
          bundled: true,
          swPrecacheConfig: swPrecacheConfig
        });
      })
      .then(() => {
        console.log('Build complete!');
        resolve();
      });
  });
}

gulp.task('build', build);
