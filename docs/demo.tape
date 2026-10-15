# Records docs/demo.gif and docs/demo.mp4 against real Docker.
# Run from the repo root: npm run build && vhs docs/demo.tape
Output docs/demo.gif
Output docs/demo.mp4

Require docker
Require node

Set Shell "bash"
Set FontSize 18
Set Width 1500
Set Height 600
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms
Set WindowBar Colorful
Set WaitTimeout 90s

Hide
Type `shopt -s interactive_comments; export AIRLOCK_HOME=$(mktemp -d) PS1='$ ' && alias airlock='node dist/cli/index.js'` Enter
Type "clear" Enter
Show

Type "# A take-home from a recruiter. Open it in a sandbox, not on your Mac." Sleep 600ms Enter
Sleep 400ms
Type "airlock import examples/suspicious-take-home --name take-home" Sleep 500ms Enter
Wait+Screen /Restricted Mode/
Sleep 4s

Hide
Type "clear" Enter
Show

Type "# Run its code. It has no access to your files or the network." Sleep 600ms Enter
Sleep 400ms
Type "airlock run take-home -- node index.js" Sleep 500ms Enter
Wait+Screen /tripwire/
Sleep 4s

Type "airlock stop take-home" Sleep 500ms Enter
# docker stop takes ~10s; cut the wait rather than show it
Hide
Wait /\$\s*$/
Show
Sleep 3s

Hide
Type `airlock rm take-home --force; rm -rf "$AIRLOCK_HOME"` Enter

Sleep 8s
