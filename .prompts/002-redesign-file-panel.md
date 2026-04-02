Hello! 

1. Need to support editing text files. 
So you can open any config or json file and edit it. The file should open at the same place where terminal is laying.
Important: support syntax highlight for yml/yaml, json and other file types. 

2. Need to redesign file panel a little.
- "go up" button should be removed. 
- Remove Upload button, and make it a bigger div within "upload" label and upload icon. When clicking should be the same. On the left should be upload files / on the right - upload folder. Keep the logic as it, just add this on the top of file system. 
- remove checkboxes for multi selection of files. Just allow to snap shift to multi select
- double click should open the file
- right click on a empty space, where is no file, should show a menu with some options with "create new file", "make directory" and upload file or upload folder 
- right click on a file should show additional file-specific features on that menu like rename, delete, download,
- remove footer with info, it is barely visible and not usefull.
- make the file name column wider, many file name are crapped but they are absolutely okay to fit on the page.


3. About header menu:
- Start command show be shown only when you're hovering over a start button, remove it from header. But it should be shown nicely, with some custom div, not just plain text
- "Stopped" div next to a server type span should be removed, we already have a start button as indicator, and other
- Remove "+new" next to the start button

4. Deletions
- all deletions "are you sure to delete" menus should be custom to implement server deletion button on the right click on the server in the menu. It should ask to type the server name to delete it. It should also show the server name there and DO NOT prevent me from copying it and pasting into the bar

