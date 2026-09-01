// Law 3: this script names a file. Pare does not rewrite scripts, so
// img/scripted.png must keep its name even though the reference looks static.
var GALLERY = ['img/scripted.png'];

function show(index) {
  document.querySelector('#slot').src = GALLERY[index];
}

show(0);
