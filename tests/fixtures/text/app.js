// A classic script. Top-level names here are globals: another script, an inline
// handler, or a string passed to setTimeout can reach them. Renaming them would
// break the page, so the minifier must leave these identifiers alone.
var siteConfig = {
  locale: 'en',
  retries: 3,
};

function trackOutboundClick(element) {
  var href = element.getAttribute('href');
  if (!href) {
    return false;
  }
  window.console.log('outbound', href, siteConfig.locale);
  return true;
}

function initCards() {
  var cards = document.querySelectorAll('.card');
  for (var i = 0; i < cards.length; i++) {
    cards[i].addEventListener('click', function (event) {
      trackOutboundClick(event.currentTarget);
    });
  }
}

initCards();
