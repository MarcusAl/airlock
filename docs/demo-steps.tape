# Steps shared by docs/demo.tape and the launch video's recording; no Set or Output here.
Require docker
Require node

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
