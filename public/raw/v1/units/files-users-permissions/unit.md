# Files, users, and permissions

Linux presents files, devices, and many kernel interfaces through one path
hierarchy rooted at `/`. A path names a directory entry; the underlying inode
stores metadata and points to file data. More than one name can refer to the
same inode, which is why deleting a path does not necessarily free the data
while another hard link or open descriptor still exists.

Every process has an effective user and group identity. When it opens a path,
the kernel checks that identity against the file owner, group, and mode bits.
The familiar three groups of `rwx` apply to owner, group, and everyone else.

For regular files, read exposes bytes, write changes bytes, and execute permits
the file to be used as a program. For directories, the meanings shift:

- read lists directory entries;
- write creates, removes, or renames entries;
- execute traverses the directory and reaches named entries.

That directory distinction explains why reading a file can fail even when the
file itself is readable: the process also needs execute permission on every
directory in the path.

## Least privilege is operational

Running a service as root may hide ownership mistakes during setup, but it
increases the impact of compromise and creates files that later processes
cannot modify. Give a service a stable non-root identity and only the directory
access it needs. Record ownership changes as configuration, not as unexplained
manual fixes.

Permissions answer “may this identity perform this operation?” They do not
encrypt data, validate its contents, or replace application authorization.
