# Session Runtime

This package owns CreatX session product configuration. It does not copy Cline messages, Runs, tools, or history.

`SessionPermissionStore` persists only the stable CreatX session ID, session kind, and approval/free mode. Unknown values and corrupt SQLite fail closed. A missing legacy row is created as the accepted default free mode when the Adapter first adopts that Cline Session.
