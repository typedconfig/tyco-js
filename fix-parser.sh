#!/bin/bash
# Apply sed fixes for TypeScript strict mode errors in parser.ts

sed -i '
# Fix line 63 - comment undefined check
s/const comment = parts\[1\]\.replace/const comment = parts[1]!.replace/

# Fix line 70 - content undefined check  
s/return content\.trimEnd/return content!.trimEnd/

# Fix lines with attrName, typeName, includePath undefined checks - add ! operator
s/\(if.*\.has(\)\(attrName\)\()\)/\1\2!\3/g
s/\(\.set(\)\(attrName\)\(,\)/\1\2!\3/g
s/\(\.add(\)\(attrName\)\()\)/\1\2!\3/g
s/\(\.push(\)\(attrName\)\()\)/\1\2!\3/g
s/\(\.addStruct(\)\(typeName\)\()\)/\1\2!\3/g
s/\(\.get(\)\(typeName\)\()\)/\1\2!\3/g
s/\(\.fromPath.*,\s*\)\(includePath\)\()\)/\1\2!\3/g
s/\(path\.join.*,\s*\)\(includePath\)\()\)/\1\2!\3/g
s/\(path\.isAbsolute(\)\(includePath\)\()\)/\1\2!\3/g

# Fix split()[1] undefined issues
s/\.split.*\[1\]\./\.split.*[1]!./g
' src/parser.ts
