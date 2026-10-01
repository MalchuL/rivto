# Chulane starts locally behind replaceable service contracts

Chulane's first phase owns local data, while its desktop application must later be able to synchronize with a server. Domain use cases depend on replaceable service contracts rather than storage or transport implementations; synchronization extension methods are part of the design, but a backend is deferred. This preserves the local-only first phase while allowing later server integration without coupling domain rules to deployment details.
