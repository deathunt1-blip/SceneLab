Option Explicit
Dim shell, fso, root, executable
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
executable = root & "\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(executable) Or Not fso.FileExists(root & "\dist\index.html") Then
  MsgBox "Please run npm ci and npm run build in this project folder first.", 48, "Camera Planner"
  WScript.Quit 1
End If
shell.CurrentDirectory = root
shell.Environment("PROCESS").Remove "ELECTRON_RUN_AS_NODE"
shell.Run Chr(34) & executable & Chr(34) & " " & Chr(34) & root & Chr(34), 0, False
