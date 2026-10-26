# Specs

## Behavior

### Requirement: Centered web add-server modal

The web-client SHALL render the add-server dialog as a centered viewport modal that is not constrained by the server rail.

### Scenario: Open add-server dialog

GIVEN a user is in the web-client

WHEN they click the add-server button in the left server rail

THEN the add-server dialog appears centered over the viewport

AND the dialog has a usable responsive width

AND the dialog is not squeezed into the server rail column

### Scenario: Tall modal content

GIVEN the add-server dialog content is taller than the available viewport

WHEN the dialog is displayed

THEN the modal body scrolls within the viewport bounds
