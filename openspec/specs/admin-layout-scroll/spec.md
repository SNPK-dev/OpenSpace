# Specs

## Behavior

### Requirement: Fixed admin sidebar with right-content scrolling

The admin app SHALL keep the left sidebar fixed to viewport height while tall right-side content scrolls inside the content area.

### Scenario: Tall admin content

GIVEN an admin page has content taller than the viewport

WHEN the admin views the page

THEN the left sidebar remains full viewport height and does not stretch with the content

AND vertical scrolling happens in the right content area

AND the document body itself does not become the primary scroll container
