const obj = {};

// console.log(obj.blub['flub'].club);

const lineRules = {
    // "ARG": {"paramSyntaxRegex": "/.+/", "rules": []},
    // "FROM": {
    //     "paramSyntaxRegex": "/^[a-z0-9./-]+(:[a-z0-9.-]+)?$/",
    //     "rules": [{
    //         "label": "is_latest_tag",
    //         "regex": "/latest/",
    //         "level": "info",
    //         "message": "base image uses 'latest' tag",
    //         "description": "using the 'latest' tag may cause unpredictable builds. It is recommended that a specific tag is used in the FROM line.",
    //         "reference_url": ["https://docs.docker.com/reference/builder/", "#from"]
    //     }, {
    //         "label": "no_tag",
    //         "regex": "/^[:]/",
    //         "level": "warn",
    //         "message": "No tag is used",
    //         "description": "lorem ipsum tar",
    //         "reference_url": ["https://docs.docker.com/reference/builder/", "#from"]
    //     }]
    // },
    // "HEALTHCHECK": {"paramSyntaxRegex": "/.+/", "rules": []},
    // "MAINTAINER": {"paramSyntaxRegex": "/.+/", "rules": []},
    // "RUN": {
    //     "paramSyntaxRegex": "/.+/",
    //     "rules": [{
    //         "label": "no_yum_clean_all",
    //         "regex": "/yum ((?!clean all).)* .+/",
    //         "level": "warn",
    //         "message": "yum clean all is not used",
    //         "description": "the yum cache will remain in this layer making the layer unnecessarily large",
    //         "reference_url": "None"
    //     }, {
    //         "label": "installing_ssh",
    //         "regex": "/ssh/",
    //         "level": "warn",
    //         "message": "installing SSH in a container is not recommended",
    //         "description": "Do you really need SSH in this image?",
    //         "reference_url": "https://github.com/jpetazzo/nsenter"
    //     }]
    // },
    // "SHELL": {"paramSyntaxRegex": "/.+/", "rules": []},
    // "CMD": {"paramSyntaxRegex": "/.+/", "rules": []},
    // "LABEL": {"paramSyntaxRegex": "/.+/", "rules": []},
    // "EXPOSE": {"paramSyntaxRegex": "/^[0-9]+([0-9\\s]+)?$/", "rules": []},
    // "ENV": {"paramSyntaxRegex": "/^(\\s?[a-zA-Z_]+[a-zA-Z0-9_]*=?.+)+$/", "rules": []},
    "ADD": {"paramSyntaxRegex": "/^(~?[A-z0-9\\/_.-]+|https?:\\/\\/(www\\.)?[-a-zA-Z0-9@:%._\\+~#=]{2,256}\\.[a-z]{2,6}\\b([-a-zA-Z0-9@$:%_\\+.~#?&\\/\\/=]*))\\s~?[A-z0-9\\/_.-]+$/"},
    // "COPY": {"paramSyntaxRegex": "/.+/", "rules": []},
    // "ENTRYPOINT": {"paramSyntaxRegex": "/.+/", "rules": []},
    // "VOLUME": {"paramSyntaxRegex": "/^~?([A-z0-9\\/_.-]+|\\[\"[A-z0-9\\/_.-]+\"\\])$/", "rules": []},
    // "USER": {"paramSyntaxRegex": "/^[a-z_][a-z0-9_]{0,30}$/", "rules": []},
    // "WORKDIR": {"paramSyntaxRegex": "/^~?[A-z0-9\\/_.-]+$/", "rules": []},
    // "ONBUILD": {"paramSyntaxRegex": "/.+/", "rules": []}
}

// for (const val in obj.obj) {
//     // console.log(val, obj.obj);
//     console.log(obj.obj[val]);
// }


for (const rule in lineRules) {
    if (lineRules.hasOwnProperty(rule)) {
        lineRules[rule].paramSyntaxRegex = eval(lineRules[rule].paramSyntaxRegex);
        for (const semanticRule in lineRules[rule].rules) {
            lineRules[rule].rules[semanticRule].regex = eval(lineRules[rule].rules[semanticRule].regex);
        }
    }
}