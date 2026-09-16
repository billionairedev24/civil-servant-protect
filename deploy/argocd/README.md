# ArgoCD

App-of-apps. One `Application` per environment, all owned by
`applications.yaml`, so adding an environment is a commit rather than a
`kubectl apply` someone did once and nobody can reproduce.

ArgoCD **promotes**; it never builds. GitLab CI builds and signs an image and
writes its digest into the environment's values file. Argo notices the commit and
rolls it out. That is why `image.digest` is preferred over `image.tag`
everywhere: a tag can be moved under you after review, a digest cannot.

## Promotion

    dev    auto-sync, self-heal      every commit to main
    uat    auto-sync                 a commit to the uat values file
    prod   manual sync               a human presses sync, after UAT sign-off
    dr     auto-sync, follows prod   Lagos, one revision behind by design

Prod is deliberately not auto-synced. A federal payroll deduction is not
something to roll out because a pipeline went green on a Friday.
